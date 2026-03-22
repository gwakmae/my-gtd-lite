class TaskNodeRenderer {
    constructor(dataService, callbacks) {
        this.ds = dataService;
        this.cb = callbacks;

        this._holdTimer = null;
        this._holdTargetEl = null;

        this._touchState = {
            startX: 0, startY: 0,
            offsetX: 0, offsetY: 0,
            taskId: null, sourceEl: null, ghostEl: null,
            isDragging: false, longPressTimer: null,
            currentDropTarget: null, currentDropPosition: null,
            lastTouchX: 0, lastTouchY: 0
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

        // ★ 항상 draggable (데스크탑 마우스 드래그용) ★
        selfEl.draggable = true;

        if (selectedIds && selectedIds.has(task.Id)) {
            if (isMultiSelectMode || selectedIds.size > 1) {
                selfEl.classList.add('is-multiselected');
            } else {
                selfEl.classList.add('is-selected');
            }
        }

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

        var card = document.createElement('div');
        card.className = 'task-card-content';
        if (task.IsCompleted) card.classList.add('is-completed');

        if (!task.IsCompleted && task.DueDate) {
            var today = new Date(); today.setHours(0, 0, 0, 0);
            var due = new Date(task.DueDate); due.setHours(0, 0, 0, 0);
            if (due < today) card.classList.add('is-overdue');
            else if (due.getTime() === today.getTime()) card.classList.add('is-due-today');
        }

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

        var title = document.createElement('span');
        title.className = 'task-title';
        title.textContent = task.Title;
        card.appendChild(title);

        var delBtn = document.createElement('button');
        delBtn.className = 'action-btn delete-btn';
        delBtn.innerHTML = '×';
        delBtn.title = 'Delete';
        delBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            self.cb.onDelete(task.Id);
        });
        card.appendChild(delBtn);

        card.addEventListener('dblclick', function(e) {
            e.stopPropagation();
            e.preventDefault();
            self.cb.onDoubleClick(task.Id);
        });

        selfEl.appendChild(card);

        var addBtn = document.createElement('button');
        addBtn.className = 'action-btn add-btn';
        addBtn.textContent = '+';
        addBtn.title = 'Add sub-task';
        addBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            self.cb.onAddChild(task.Id, nodeEl);
        });
        selfEl.appendChild(addBtn);

        selfEl.addEventListener('click', function(e) {
            self.cb.onTaskClick(task.Id, e);
        });

        // ★ 데스크탑 Drag — 항상 등록 ★
        selfEl.addEventListener('dragstart', function(e) {
            // 터치 드래그 중이면 HTML5 drag 무시
            if (self._touchState.isDragging) {
                e.preventDefault();
                return;
            }
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

        // ★ 모바일 Touch — 항상 등록 (터치 지원 기기에서만 실제 동작) ★
        selfEl.addEventListener('touchstart', function(e) {
            if (e.touches.length !== 1) return;
            var touch = e.touches[0];
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
                // draggable을 일시 해제해서 HTML5 drag 충돌 방지
                selfEl.draggable = false;
                selfEl.classList.add('is-dragging-source');
                self.cb.onDragStart(task.Id, selfEl);
                self._createGhost(selfEl, touch.clientX, touch.clientY);
                if (navigator.vibrate) navigator.vibrate(30);
            }, 500);

            document.addEventListener('touchmove', self._boundTouchMove, { passive: false });
            document.addEventListener('touchend', self._boundTouchEnd);
            selfEl.addEventListener('contextmenu', self._preventContext);
        }, { passive: true });

        nodeEl.appendChild(selfEl);

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

    _preventContext(e) { e.preventDefault(); }

    _createGhost(sourceEl, x, y) {
        var ts = this._touchState;
        var ghost = sourceEl.cloneNode(true);
        ghost.className = 'task-node-self touch-drag-ghost';
        ghost.style.position = 'fixed';
        ghost.style.zIndex = '9999';
        ghost.style.pointerEvents = 'none';
        ghost.style.width = sourceEl.offsetWidth + 'px';
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
            if (dx > 10 || dy > 10) { this._cancelTouch(); }
            return;
        }
        e.preventDefault();
        ts.lastTouchX = touch.clientX;
        ts.lastTouchY = touch.clientY;
        if (ts.ghostEl) {
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
            if (prevSelf) prevSelf.classList.remove('drop-above', 'drop-below', 'drop-inside', 'drop-invalid');
            var prevTop = ts.currentDropTarget.closest('.column-drop-top');
            if (prevTop) prevTop.classList.remove('drag-over-top');
            document.querySelectorAll('.drag-over-column').forEach(function(el) { el.classList.remove('drag-over-column'); });
            this._clearHoldTimer();
        }
        if (!elemBelow) { ts.currentDropTarget = null; ts.currentDropPosition = null; return; }
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
        document.querySelectorAll('.drag-over-column').forEach(function(el) { el.classList.remove('drag-over-column'); });

        if (!taskSelfEl) { ts.currentDropPosition = null; this._clearHoldTimer(); return; }

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
        if (taskSelfEl.classList.contains('drop-inside')) return;

        taskSelfEl.classList.remove('drop-above', 'drop-below', 'drop-inside', 'drop-invalid');
        var rect = taskSelfEl.getBoundingClientRect();
        var offsetY = clientY - rect.top;
        if (offsetY < rect.height * 0.5) {
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
        if (ts.sourceEl) ts.sourceEl.removeEventListener('contextmenu', this._preventContext);

        if (!ts.isDragging) { this._cancelTouch(); return; }

        // ★ draggable 복원 ★
        if (ts.sourceEl) ts.sourceEl.draggable = true;

        if (ts.ghostEl) ts.ghostEl.style.display = 'none';
        var finalElem = document.elementFromPoint(ts.lastTouchX, ts.lastTouchY);
        if (ts.ghostEl) { ts.ghostEl.remove(); ts.ghostEl = null; }
        if (ts.sourceEl) ts.sourceEl.classList.remove('is-dragging-source');
        this._clearHoldTimer();

        var position = ts.currentDropPosition;

        if (finalElem) {
            var finalDropTop = finalElem.closest('.column-drop-top');
            if (finalDropTop) {
                position = 'column-top';
                ts.currentDropTarget = finalDropTop;
            } else if (position !== 'Inside') {
                var finalTaskSelf = finalElem.closest('.task-node-self');
                var finalTaskList = finalElem.closest('.task-list');
                if (finalTaskList && !finalTaskSelf) {
                    position = 'column-empty';
                    ts.currentDropTarget = finalTaskList;
                } else if (finalTaskSelf) {
                    var fid = parseInt(finalTaskSelf.dataset.taskId);
                    if (fid && fid !== ts.taskId && !this._isDescendant(fid, ts.taskId)) {
                        var rect = finalTaskSelf.getBoundingClientRect();
                        position = (ts.lastTouchY - rect.top) < rect.height * 0.5 ? 'Above' : 'Below';
                        ts.currentDropTarget = finalTaskSelf;
                    }
                }
            }
        }

        if (position === 'column-top') {
            document.querySelectorAll('.drag-over-top').forEach(function(el) { el.classList.remove('drag-over-top'); });
            var colEl = ts.currentDropTarget ? ts.currentDropTarget.closest('.board-column') : null;
            if (colEl && colEl.dataset.status && this.cb.onDropColumnTop) {
                this.cb.onDropColumnTop(colEl.dataset.status);
            } else {
                this.cb.onDragEnd();
            }
            this._resetTouchState();
            return;
        }

        if (position === 'column-empty') {
            document.querySelectorAll('.drag-over-column').forEach(function(el) { el.classList.remove('drag-over-column'); });
            var colEl = ts.currentDropTarget ? ts.currentDropTarget.closest('.board-column') : null;
            if (colEl && colEl.dataset.status && this.cb.onDropColumnEmpty) {
                this.cb.onDropColumnEmpty(colEl.dataset.status);
            } else {
                this.cb.onDragEnd();
            }
            this._resetTouchState();
            return;
        }

        if (position === 'Above' || position === 'Below' || position === 'Inside') {
            var targetSelfEl = ts.currentDropTarget ? ts.currentDropTarget.closest('.task-node-self') : null;
            if (targetSelfEl) {
                var targetId = parseInt(targetSelfEl.dataset.taskId);
                targetSelfEl.classList.remove('drop-above', 'drop-below', 'drop-inside', 'drop-invalid');
                if (targetId) this.cb.onDrop(targetId, position);
            }
            this.cb.onDragEnd();
            this._resetTouchState();
            return;
        }

        this.cb.onDragEnd();
        this._resetTouchState();
    }

    _cancelTouch() {
        var ts = this._touchState;
        if (ts.longPressTimer) { clearTimeout(ts.longPressTimer); ts.longPressTimer = null; }
        if (ts.sourceEl) {
            ts.sourceEl.removeEventListener('contextmenu', this._preventContext);
            ts.sourceEl.draggable = true; // ★ 복원 ★
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
            startX: 0, startY: 0, offsetX: 0, offsetY: 0,
            taskId: null, sourceEl: null, ghostEl: null,
            isDragging: false, longPressTimer: null,
            currentDropTarget: null, currentDropPosition: null,
            lastTouchX: 0, lastTouchY: 0
        };
    }

    _clearHoldTimer() {
        if (this._holdTimer) { clearTimeout(this._holdTimer); this._holdTimer = null; }
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
        if (selfEl.classList.contains('drop-inside')) return;

        selfEl.classList.remove('drop-above', 'drop-below', 'drop-invalid');
        var rect = selfEl.getBoundingClientRect();
        var offsetY = e.clientY - rect.top;
        if (offsetY < rect.height * 0.5) {
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
        if (selfEl.classList.contains('drop-inside')) position = 'Inside';
        else if (selfEl.classList.contains('drop-above')) position = 'Above';

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
