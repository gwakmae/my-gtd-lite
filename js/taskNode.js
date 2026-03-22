class TaskNodeRenderer {
    constructor(dataService, callbacks) {
        this.ds = dataService;
        this.cb = callbacks;

        this._holdTimer = null;
        this._holdTargetEl = null;

        this._isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

        this._touchState = {
            startX: 0,
            startY: 0,
            offsetX: 0,
            offsetY: 0,
            taskId: null,
            sourceEl: null,
            ghostEl: null,
            isDragging: false,
            longPressTimer: null,
            currentDropTarget: null,
            currentDropPosition: null
        };

        this._boundTouchMove = this._onTouchMove.bind(this);
        this._boundTouchEnd = this._onTouchEnd.bind(this);
    }

    render(task, opts) {
        opts = opts || {};
        var hideCompleted = opts.hideCompleted;
        var showHidden = opts.showHidden;
        var selectedIds = opts.selectedIds;
        var isMultiSelectMode = opts.isMultiSelectMode;

        if (hideCompleted && task.IsCompleted) return null;
        if (!showHidden && task.IsHidden) return null;

        var self = this;

        var nodeEl = document.createElement('div');
        nodeEl.className = 'task-node';
        nodeEl.dataset.taskId = task.Id;

        var selfEl = document.createElement('div');
        selfEl.className = 'task-node-self';
        selfEl.dataset.taskId = task.Id;

        if (!this._isTouchDevice) {
            selfEl.draggable = true;
        }

        if (selectedIds && selectedIds.has(task.Id)) {
            if (isMultiSelectMode || selectedIds.size > 1) {
                selfEl.classList.add('is-multiselected');
            } else {
                selfEl.classList.add('is-selected');
            }
        }

        // Expander
        if (task.Children && task.Children.length > 0) {
            var exp = document.createElement('span');
            exp.className = 'expander';
            exp.textContent = task.IsExpanded ? '▼' : '▶';
            exp.addEventListener('click', function(e) {
                e.stopPropagation();
                task.IsExpanded = !task.IsExpanded;
                self.ds.updateExpandState(task.Id, task.IsExpanded);
                self.cb.onRefresh();
            });
            selfEl.appendChild(exp);
        } else {
            var ph = document.createElement('span');
            ph.className = 'expander-placeholder';
            selfEl.appendChild(ph);
        }

        // Task Card Content
        var card = document.createElement('div');
        card.className = 'task-card-content';
        if (task.IsCompleted) card.classList.add('is-completed');

        if (!task.IsCompleted && task.DueDate) {
            var today = new Date(); today.setHours(0, 0, 0, 0);
            var due = new Date(task.DueDate); due.setHours(0, 0, 0, 0);
            if (due < today) card.classList.add('is-overdue');
            else if (due.getTime() === today.getTime()) card.classList.add('is-due-today');
        }

        // Checkbox
        var checkBtn = document.createElement('button');
        checkBtn.className = 'task-checkbox-btn';
        checkBtn.type = 'button';
        var checkIcon = document.createElement('span');
        checkIcon.className = 'task-checkbox';
        checkIcon.textContent = task.IsCompleted ? '☑' : '☐';
        checkIcon.style.fontSize = '1.1rem';
        checkBtn.appendChild(checkIcon);
        checkBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            self.cb.onToggleComplete(task.Id);
        });
        card.appendChild(checkBtn);

        // Title
        var title = document.createElement('span');
        title.className = 'task-title';
        title.textContent = task.Title;
        card.appendChild(title);

        // Delete button
        var delBtn = document.createElement('button');
        delBtn.className = 'action-btn delete-btn';
        delBtn.innerHTML = '×';
        delBtn.title = 'Delete';
        delBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            self.cb.onDelete(task.Id);
        });
        card.appendChild(delBtn);

        // Double click to edit
        card.addEventListener('dblclick', function(e) {
            e.stopPropagation();
            e.preventDefault();
            self.cb.onDoubleClick(task.Id);
        });

        selfEl.appendChild(card);

        // Add child button
        var addBtn = document.createElement('button');
        addBtn.className = 'action-btn add-btn';
        addBtn.textContent = '+';
        addBtn.title = 'Add sub-task';
        addBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            self.cb.onAddChild(task.Id, nodeEl);
        });
        selfEl.appendChild(addBtn);

        // Click handler
        selfEl.addEventListener('click', function(e) {
            self.cb.onTaskClick(task.Id, e);
        });

        // ══════════════════════════════════
        // 데스크탑 Drag API
        // ══════════════════════════════════
        if (!this._isTouchDevice) {
            selfEl.addEventListener('dragstart', function(e) {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(task.Id));
                self.cb.onDragStart(task.Id, selfEl);
            });
            selfEl.addEventListener('dragend', function() {
                self._clearHoldTimer();
                self.cb.onDragEnd();
            });
            selfEl.addEventListener('dragover', function(e) {
                e.preventDefault();
                e.stopPropagation();
                self._handleDragOver(selfEl, task, e);
            });
            selfEl.addEventListener('dragleave', function() {
                self._clearHoldTimer();
                selfEl.classList.remove('drop-above', 'drop-below', 'drop-inside', 'drop-invalid');
            });
            selfEl.addEventListener('drop', function(e) {
                e.preventDefault();
                e.stopPropagation();
                self._clearHoldTimer();
                self._handleDrop(selfEl, task);
            });
        }

        // ══════════════════════════════════
        // 모바일 Touch 드래그
        // ══════════════════════════════════
        if (this._isTouchDevice) {
            selfEl.addEventListener('touchstart', function(e) {
                if (e.touches.length !== 1) return;
                var touch = e.touches[0];

                // 손가락과 요소 간 오프셋 계산 (고스트가 정확히 손가락 아래에 오도록)
                var rect = selfEl.getBoundingClientRect();
                self._touchState.offsetX = touch.clientX - rect.left;
                self._touchState.offsetY = touch.clientY - rect.top;
                self._touchState.startX = touch.clientX;
                self._touchState.startY = touch.clientY;
                self._touchState.taskId = task.Id;
                self._touchState.sourceEl = selfEl;
                self._touchState.isDragging = false;

                self._touchState.longPressTimer = setTimeout(function() {
                    self._touchState.isDragging = true;
                    selfEl.classList.add('is-dragging-source');
                    self.cb.onDragStart(task.Id, selfEl);
                    self._createGhost(selfEl, touch.clientX, touch.clientY);
                    if (navigator.vibrate) navigator.vibrate(30);
                }, 500);

                document.addEventListener('touchmove', self._boundTouchMove, { passive: false });
                document.addEventListener('touchend', self._boundTouchEnd);

                // ★ 컨텍스트 메뉴 방지
                selfEl.addEventListener('contextmenu', self._preventContext);
            }, { passive: true });
        }

        nodeEl.appendChild(selfEl);

        // Children
        if (task.IsExpanded && task.Children && task.Children.length > 0) {
            var childrenEl = document.createElement('div');
            childrenEl.className = 'task-node-children';

            var filteredChildren = task.Children
                .filter(function(c) { return !(hideCompleted && c.IsCompleted); })
                .filter(function(c) { return showHidden || !c.IsHidden; })
                .sort(function(a, b) { return a.SortOrder - b.SortOrder; });

            for (var i = 0; i < filteredChildren.length; i++) {
                var childNode = this.render(filteredChildren[i], opts);
                if (childNode) childrenEl.appendChild(childNode);
            }
            nodeEl.appendChild(childrenEl);
        }

        return nodeEl;
    }

    // ══════════════════════════════════
    // 모바일 Touch 핸들러
    // ══════════════════════════════════

    _preventContext(e) {
        e.preventDefault();
    }

    _createGhost(sourceEl, x, y) {
        var ts = this._touchState;
        var ghost = sourceEl.cloneNode(true);
        ghost.className = 'task-node-self touch-drag-ghost';
        ghost.style.position = 'fixed';
        ghost.style.zIndex = '9999';
        ghost.style.pointerEvents = 'none';
        ghost.style.width = sourceEl.offsetWidth + 'px';
        // ★ 손가락 위치 기준으로 정확하게 배치 (기울기 없음)
        ghost.style.left = (x - ts.offsetX) + 'px';
        ghost.style.top = (y - ts.offsetY) + 'px';
        document.body.appendChild(ghost);
        ts.ghostEl = ghost;
    }

    _onTouchMove(e) {
        var ts = this._touchState;
        var touch = e.touches[0];

        if (!ts.isDragging) {
            var dx = Math.abs(touch.clientX - ts.startX);
            var dy = Math.abs(touch.clientY - ts.startY);
            if (dx > 10 || dy > 10) {
                this._cancelTouch();
            }
            return;
        }

        e.preventDefault();

        if (ts.ghostEl) {
            // ★ 손가락 오프셋 유지 — 고스트가 정확히 원래 위치에서 따라다님
            ts.ghostEl.style.left = (touch.clientX - ts.offsetX) + 'px';
            ts.ghostEl.style.top = (touch.clientY - ts.offsetY) + 'px';
        }

        if (ts.ghostEl) ts.ghostEl.style.display = 'none';
        var elemBelow = document.elementFromPoint(touch.clientX, touch.clientY);
        if (ts.ghostEl) ts.ghostEl.style.display = '';

        this._updateTouchDropTarget(elemBelow, touch.clientY);
    }

    _updateTouchDropTarget(elemBelow, clientY) {
        var ts = this._touchState;

        if (ts.currentDropTarget && ts.currentDropTarget !== elemBelow) {
            var prevSelf = ts.currentDropTarget.closest('.task-node-self');
            if (prevSelf) {
                prevSelf.classList.remove('drop-above', 'drop-below', 'drop-inside', 'drop-invalid');
            }
            var prevTop = ts.currentDropTarget.closest('.column-drop-top');
            if (prevTop) prevTop.classList.remove('drag-over-top');

            document.querySelectorAll('.drag-over-column').forEach(function(el) {
                el.classList.remove('drag-over-column');
            });

            this._clearHoldTimer();
        }

        if (!elemBelow) {
            ts.currentDropTarget = null;
            ts.currentDropPosition = null;
            return;
        }

        ts.currentDropTarget = elemBelow;

        var dropTopEl = elemBelow.closest('.column-drop-top');
        if (dropTopEl) {
            dropTopEl.classList.add('drag-over-top');
            ts.currentDropPosition = 'column-top';
            this._clearHoldTimer();
            return;
        }

        var taskSelfEl = elemBelow.closest('.task-node-self');
        var taskListEl = elemBelow.closest('.task-list');

        if (taskListEl && !taskSelfEl) {
            taskListEl.classList.add('drag-over-column');
            ts.currentDropPosition = 'column-empty';
            this._clearHoldTimer();
            return;
        }

        document.querySelectorAll('.drag-over-column').forEach(function(el) {
            el.classList.remove('drag-over-column');
        });

        if (!taskSelfEl) {
            ts.currentDropPosition = null;
            this._clearHoldTimer();
            return;
        }

        var targetTaskId = parseInt(taskSelfEl.dataset.taskId);
        if (!targetTaskId || targetTaskId === ts.taskId) {
            taskSelfEl.classList.remove('drop-above', 'drop-below', 'drop-inside');
            taskSelfEl.classList.add('drop-invalid');
            ts.currentDropPosition = null;
            this._clearHoldTimer();
            return;
        }

        if (this._isDescendant(targetTaskId, ts.taskId)) {
            taskSelfEl.classList.remove('drop-above', 'drop-below', 'drop-inside');
            taskSelfEl.classList.add('drop-invalid');
            ts.currentDropPosition = null;
            this._clearHoldTimer();
            return;
        }

        if (taskSelfEl.classList.contains('drop-inside')) {
            return;
        }

        taskSelfEl.classList.remove('drop-above', 'drop-below', 'drop-inside', 'drop-invalid');

        var rect = taskSelfEl.getBoundingClientRect();
        var offsetY = clientY - rect.top;
        var height = rect.height;

        if (offsetY < height * 0.5) {
            taskSelfEl.classList.add('drop-above');
            ts.currentDropPosition = 'Above';
        } else {
            taskSelfEl.classList.add('drop-below');
            ts.currentDropPosition = 'Below';
        }

        var self = this;
        if (this._holdTargetEl !== taskSelfEl) {
            this._clearHoldTimer();
            this._holdTargetEl = taskSelfEl;
            this._holdTimer = setTimeout(function() {
                taskSelfEl.classList.remove('drop-above', 'drop-below', 'drop-invalid');
                taskSelfEl.classList.add('drop-inside');
                ts.currentDropPosition = 'Inside';
                self._holdTimer = null;
                if (navigator.vibrate) navigator.vibrate(20);
            }, 800);
        }
    }

    _onTouchEnd(e) {
        var ts = this._touchState;

        document.removeEventListener('touchmove', this._boundTouchMove);
        document.removeEventListener('touchend', this._boundTouchEnd);

        // ★ 컨텍스트 메뉴 방지 리스너 제거
        if (ts.sourceEl) {
            ts.sourceEl.removeEventListener('contextmenu', this._preventContext);
        }

        if (!ts.isDragging) {
            this._cancelTouch();
            return;
        }

        if (ts.ghostEl) {
            ts.ghostEl.remove();
            ts.ghostEl = null;
        }

        if (ts.sourceEl) {
            ts.sourceEl.classList.remove('is-dragging-source');
        }

        this._clearHoldTimer();

        var position = ts.currentDropPosition;

        if (position === 'column-top') {
            var topEl = ts.currentDropTarget ? ts.currentDropTarget.closest('.column-drop-top') : null;
            if (topEl) topEl.classList.remove('drag-over-top');
            var colEl = ts.currentDropTarget ? ts.currentDropTarget.closest('.board-column') : null;
            if (colEl && colEl.dataset.status) {
                var ids = this._getDragIds();
                if (ids.length > 0) {
                    this.ds.moveTasks(ids, colEl.dataset.status, null, 0);
                }
            }
            this.cb.onDragEnd();
            this._resetTouchState();
            return;
        }

        if (position === 'column-empty') {
            document.querySelectorAll('.drag-over-column').forEach(function(el) {
                el.classList.remove('drag-over-column');
            });
            var colEl = ts.currentDropTarget ? ts.currentDropTarget.closest('.board-column') : null;
            if (colEl && colEl.dataset.status) {
                var status = colEl.dataset.status;
                var ids = this._getDragIds();
                if (ids.length > 0) {
                    var siblings = this.ds.getTasksForStatus(status);
                    this.ds.moveTasks(ids, status, null, siblings.length);
                }
            }
            this.cb.onDragEnd();
            this._resetTouchState();
            return;
        }

        if (position === 'Above' || position === 'Below' || position === 'Inside') {
            var targetSelfEl = ts.currentDropTarget ? ts.currentDropTarget.closest('.task-node-self') : null;
            if (targetSelfEl) {
                var targetId = parseInt(targetSelfEl.dataset.taskId);
                targetSelfEl.classList.remove('drop-above', 'drop-below', 'drop-inside', 'drop-invalid');
                if (targetId) {
                    this.cb.onDrop(targetId, position);
                }
            }
            this.cb.onDragEnd();
            this._resetTouchState();
            return;
        }

        this.cb.onDragEnd();
        this._resetTouchState();
    }

    _getDragIds() {
        if (this.cb.getDraggedId) {
            var draggedId = this.cb.getDraggedId();
            if (draggedId) return [draggedId];
        }
        return [];
    }

    _cancelTouch() {
        var ts = this._touchState;
        if (ts.longPressTimer) {
            clearTimeout(ts.longPressTimer);
            ts.longPressTimer = null;
        }
        if (ts.sourceEl) {
            ts.sourceEl.removeEventListener('contextmenu', this._preventContext);
        }
        document.removeEventListener('touchmove', this._boundTouchMove);
        document.removeEventListener('touchend', this._boundTouchEnd);
        this._resetTouchState();
    }

    _resetTouchState() {
        document.querySelectorAll('.drop-above, .drop-below, .drop-inside, .drop-invalid, .drag-over-top, .drag-over-column').forEach(function(el) {
            el.classList.remove('drop-above', 'drop-below', 'drop-inside', 'drop-invalid', 'drag-over-top', 'drag-over-column');
        });

        this._touchState = {
            startX: 0,
            startY: 0,
            offsetX: 0,
            offsetY: 0,
            taskId: null,
            sourceEl: null,
            ghostEl: null,
            isDragging: false,
            longPressTimer: null,
            currentDropTarget: null,
            currentDropPosition: null
        };
    }

    // ══════════════════════════════════
    // 데스크탑 Drag 핸들러
    // ══════════════════════════════════

    _clearHoldTimer() {
        if (this._holdTimer) {
            clearTimeout(this._holdTimer);
            this._holdTimer = null;
        }
        this._holdTargetEl = null;
    }

    _handleDragOver(selfEl, task, e) {
        var draggedId = this.cb.getDraggedId();
        if (!draggedId || draggedId === task.Id) {
            this._clearHoldTimer();
            selfEl.classList.remove('drop-above', 'drop-below', 'drop-inside');
            selfEl.classList.add('drop-invalid');
            return;
        }
        if (this._isDescendant(task.Id, draggedId)) {
            this._clearHoldTimer();
            selfEl.classList.remove('drop-above', 'drop-below', 'drop-inside');
            selfEl.classList.add('drop-invalid');
            return;
        }

        if (selfEl.classList.contains('drop-inside')) {
            return;
        }

        selfEl.classList.remove('drop-above', 'drop-below', 'drop-invalid');

        var rect = selfEl.getBoundingClientRect();
        var offsetY = e.clientY - rect.top;
        var height = rect.height;

        if (offsetY < height * 0.5) {
            selfEl.classList.add('drop-above');
        } else {
            selfEl.classList.add('drop-below');
        }

        var self = this;
        if (this._holdTargetEl !== selfEl) {
            this._clearHoldTimer();
            this._holdTargetEl = selfEl;
            this._holdTimer = setTimeout(function() {
                selfEl.classList.remove('drop-above', 'drop-below', 'drop-invalid');
                selfEl.classList.add('drop-inside');
                self._holdTimer = null;
            }, 800);
        }
    }

    _handleDrop(selfEl, targetTask) {
        if (selfEl.classList.contains('drop-invalid')) {
            selfEl.classList.remove('drop-above', 'drop-below', 'drop-inside', 'drop-invalid');
            return;
        }

        var position = 'Below';
        if (selfEl.classList.contains('drop-inside')) {
            position = 'Inside';
        } else if (selfEl.classList.contains('drop-above')) {
            position = 'Above';
        }

        selfEl.classList.remove('drop-above', 'drop-below', 'drop-inside', 'drop-invalid');
        this.cb.onDrop(targetTask.Id, position);
    }

    _isDescendant(checkId, rootId) {
        var self = this;
        var desc = [];
        var collect = function(pid) {
            self.ds.getRawTasks().filter(function(t) { return t.ParentId === pid; }).forEach(function(c) {
                desc.push(c.Id);
                collect(c.Id);
            });
        };
        collect(rootId);
        return desc.indexOf(checkId) !== -1;
    }
}
