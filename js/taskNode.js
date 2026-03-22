class TaskNodeRenderer {
    constructor(dataService, callbacks) {
        this.ds = dataService;
        this.cb = callbacks;

        // 홀드 타이머 (자식 모드 전환용)
        this._holdTimer = null;
        this._holdTargetEl = null;

        // 모바일 감지
        this._isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

        // ── 모바일 터치 드래그 상태 ──
        this._touchState = {
            startX: 0,
            startY: 0,
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

        // ★ 모바일에서는 draggable 비활성화 (브라우저 기본 드래그 방지)
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
        // 데스크탑 Drag API (터치 기기가 아닐 때만)
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
        // 모바일 Touch 드래그 (터치 기기일 때만)
        // ══════════════════════════════════
        if (this._isTouchDevice) {
            selfEl.addEventListener('touchstart', function(e) {
                if (e.touches.length !== 1) return;
                var touch = e.touches[0];
                self._touchState.startX = touch.clientX;
                self._touchState.startY = touch.clientY;
                self._touchState.taskId = task.Id;
                self._touchState.sourceEl = selfEl;
                self._touchState.isDragging = false;

                // 0.5초 롱프레스로 드래그 시작
                self._touchState.longPressTimer = setTimeout(function() {
                    self._touchState.isDragging = true;
                    selfEl.classList.add('is-dragging-source');
                    self.cb.onDragStart(task.Id, selfEl);
                    self._createGhost(selfEl, touch.clientX, touch.clientY);

                    if (navigator.vibrate) navigator.vibrate(30);
                }, 500);

                document.addEventListener('touchmove', self._boundTouchMove, { passive: false });
                document.addEventListener('touchend', self._boundTouchEnd);
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

    _createGhost(sourceEl, x, y) {
        var ghost = sourceEl.cloneNode(true);
        ghost.className = 'task-node-self touch-drag-ghost';
        ghost.style.position = 'fixed';
        ghost.style.zIndex = '9999';
        ghost.style.pointerEvents = 'none';
        ghost.style.opacity = '0.85';
        ghost.style.width = sourceEl.offsetWidth + 'px';
        ghost.style.transform = 'rotate(2deg) scale(1.03)';
        ghost.style.boxShadow = '0 8px 24px rgba(0,0,0,0.2)';
        ghost.style.left = (x - sourceEl.offsetWidth / 2) + 'px';
        ghost.style.top = (y - 20) + 'px';
        document.body.appendChild(ghost);
        this._touchState.ghostEl = ghost;
    }

    _onTouchMove(e) {
        var ts = this._touchState;
        var touch = e.touches[0];

        // 롱프레스 전에 움직이면 취소
        if (!ts.isDragging) {
            var dx = Math.abs(touch.clientX - ts.startX);
            var dy = Math.abs(touch.clientY - ts.startY);
            if (dx > 10 || dy > 10) {
                this._cancelTouch();
            }
            return;
        }

        // 드래그 중 — 스크롤 방지, 고스트 이동
        e.preventDefault();

        if (ts.ghostEl) {
            ts.ghostEl.style.left = (touch.clientX - ts.sourceEl.offsetWidth / 2) + 'px';
            ts.ghostEl.style.top = (touch.clientY - 20) + 'px';
        }

        // 손가락 아래의 드롭 타겟 찾기
        if (ts.ghostEl) ts.ghostEl.style.display = 'none';
        var elemBelow = document.elementFromPoint(touch.clientX, touch.clientY);
        if (ts.ghostEl) ts.ghostEl.style.display = '';

        this._updateTouchDropTarget(elemBelow, touch.clientY);
    }

    _updateTouchDropTarget(elemBelow, clientY) {
        var ts = this._touchState;

        // 이전 타겟 정리
        if (ts.currentDropTarget && ts.currentDropTarget !== elemBelow) {
            var prevSelf = ts.currentDropTarget.closest('.task-node-self');
            if (prevSelf) {
                prevSelf.classList.remove('drop-above', 'drop-below', 'drop-inside', 'drop-invalid');
            }
            var prevTop = ts.currentDropTarget.closest('.column-drop-top');
            if (prevTop) prevTop.classList.remove('drag-over-top');

            // task-list 하이라이트도 정리
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

        // ── column-drop-top 위인지 체크 ──
        var dropTopEl = elemBelow.closest('.column-drop-top');
        if (dropTopEl) {
            dropTopEl.classList.add('drag-over-top');
            ts.currentDropPosition = 'column-top';
            this._clearHoldTimer();
            return;
        }

        // ── task-node-self 위인지 체크 (task-list보다 먼저) ──
        var taskSelfEl = elemBelow.closest('.task-node-self');

        // ── task-list 빈 영역인지 체크 ──
        var taskListEl = elemBelow.closest('.task-list');

        if (taskListEl && !taskSelfEl) {
            taskListEl.classList.add('drag-over-column');
            ts.currentDropPosition = 'column-empty';
            this._clearHoldTimer();
            return;
        }

        // task-list 하이라이트 제거
        document.querySelectorAll('.drag-over-column').forEach(function(el) {
            el.classList.remove('drag-over-column');
        });

        // ── task-node-self 위인지 체크 ──
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

        // 이미 자식 모드면 유지
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

        // 홀드 타이머: 같은 타겟에 0.8초 머무르면 자식 모드
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

        if (!ts.isDragging) {
            this._cancelTouch();
            return;
        }

        // 고스트 제거
        if (ts.ghostEl) {
            ts.ghostEl.remove();
            ts.ghostEl = null;
        }

        // 소스 스타일 복원
        if (ts.sourceEl) {
            ts.sourceEl.classList.remove('is-dragging-source');
        }

        this._clearHoldTimer();

        var position = ts.currentDropPosition;

        // ── column-drop-top에 드롭 ──
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

        // ── 칼럼 빈 영역에 드롭 ──
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

        // ── task 위에 드롭 ──
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

        // 아무 곳에도 안 떨어짐 — 취소
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
