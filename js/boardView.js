class BoardView {
    constructor(dataService, undoService, toastService) {
        this.ds = dataService;
        this.undo = undoService;
        this.toast = toastService;
        this.dragDrop = new DragDropManager();
        this.modal = new TaskModal(dataService);
        this.bulkPanel = new BulkEditPanel();
        this.selectedIds = new Set();
        this.isMultiSelectMode = false;
        this.lastClickedId = null;
        this.renderedTasks = [];
        this.hideCompleted = localStorage.getItem('gtd-hide-completed') === 'true';
        this.showHidden = localStorage.getItem('gtd-show-hidden') === 'true';

        this._savedScrollLeft = 0;
        this._savedScrollTop = 0; // 👈 세로 스크롤 저장용 변수 추가

        // ★★★ 연속 입력 상태 ★★★
        this._quickAddState = null;
        this._quickAddId = 0; // 입력창 고유 ID (stale blur 방지)

        var self = this;

        this.nodeRenderer = new TaskNodeRenderer(dataService, {
            onTaskClick: function (taskId, e) {
                var task = self.ds.getById(taskId);
                if (task) self._handleTaskClick(task, e);
            },
            onDoubleClick: function (taskId) {
                var task = self.ds.getById(taskId);
                if (task) self._openModal(task);
            },
            onToggleComplete: function (taskId) {
                self.ds.toggleComplete(taskId);
            },
            onDelete: function (taskId) {
                var task = self.ds.getById(taskId);
                if (task) self._deleteTask(task);
            },
            onAddChild: function (taskId) {
                var task = self.ds.getById(taskId);
                if (task) self._showChildQuickAdd(task);
            },
            onDragStart: function (taskId, el) {
                self.dragDrop.setSelectedIds(self.selectedIds);
                self.dragDrop.startDrag(taskId, el);
            },
            onDragEnd: function () { self.dragDrop.endDrag(); },
            onDrop: function (targetId, position) { self._handleDrop(targetId, position); },
            getDraggedId: function () { return self.dragDrop.getDraggedId(); },
            onRefresh: function () { self.render(); },
            onDropColumnTop: function (status) {
                var ids = self.dragDrop.getIdsToMove();
                if (ids.length > 0 && status) {
                    self.ds.moveTasks(ids, status, null, 0);
                }
                self.dragDrop.endDrag();
            },
            onDropColumnEmpty: function (status) {
                var ids = self.dragDrop.getIdsToMove();
                if (ids.length > 0 && status) {
                    var siblings = self.ds.getRawTasks().filter(function (t) {
                        return t.ParentId == null && t.Status === status;
                    });
                    self.ds.moveTasks(ids, status, null, siblings.length);
                }
                self.dragDrop.endDrag();
            }
        });
    }

    render() {
        var container = document.getElementById('content-area');
        if (!container) return;

        var oldBoard = container.querySelector('.board-container');
        if (oldBoard) {
            this._savedScrollLeft = oldBoard.scrollLeft;
            this._savedScrollTop = oldBoard.scrollTop; // 👈 세로 스크롤 상태 백업
        }

        container.innerHTML = '';

        var header = this._renderHeader();
        container.appendChild(header);

        var boardContainer = document.createElement('div');
        boardContainer.className = 'board-container';

        var todayTasks = this.ds.getTodayTasks();
        var todayCol = this._renderColumn('오늘 할 일', todayTasks, null, true);
        todayCol.classList.add('today-column');
        boardContainer.appendChild(todayCol);

        var self = this;
        TaskStatusList.forEach(function (status) {
            var tasks = self.ds.getTasksForStatus(status);
            var col = self._renderColumn(status, tasks, status, false);
            boardContainer.appendChild(col);
        });

        container.appendChild(boardContainer);

        var savedScrollX = this._savedScrollLeft;
        var savedScrollY = this._savedScrollTop;
        if (savedScrollX > 0 || savedScrollY > 0) {
            requestAnimationFrame(function () {
                if (savedScrollX > 0) boardContainer.scrollLeft = savedScrollX;
                if (savedScrollY > 0) boardContainer.scrollTop = savedScrollY; // 👈 세로 스크롤 상태 복원
            });
        }

        var bulkBar = this._renderBulkBar();
        if (bulkBar) container.appendChild(bulkBar);

        this.dragDrop.setSelectedIds(this.selectedIds);
        this.renderedTasks = this._buildRenderedList();

        // ★★★ 연속 입력 중이었으면 입력창 자동 복원 ★★★
        if (this._quickAddState) {
            var st = this._quickAddState;
            if (st.type === 'column') {
                this._attachQuickInput('column', st.status, null, null);
            } else if (st.type === 'child') {
                this._attachQuickInput('child', null, st.parentId, null);
            } else if (st.type === 'sibling') {
                this._attachQuickInput('sibling', st.status, st.parentId, st.anchorTaskId);
            }
        }
    }

    // ★★★ 통합된 입력창 생성/부착 메서드 ★★★
    _attachQuickInput(type, status, parentId, anchorTaskId) {
        var self = this;
        var container = document.createElement('div');
        container.className = 'quick-add-container' + (type === 'child' ? ' child-add' : '') + (type === 'sibling' ? ' sibling-add' : '');

        var input = document.createElement('input');
        input.type = 'text';
        input.className = 'quick-add-input';
        input.placeholder = (type === 'child' ? '하위 작업 제목' : type === 'sibling' ? '새 형제 작업' : '새 작업 제목') + '... (빈 Enter = 종료)';
        container.appendChild(input);

        var addBtn = null;

        // DOM에 부착
        if (type === 'column') {
            var col = document.querySelector('.board-column[data-status="' + status + '"]');
            if (!col) return;
            addBtn = col.querySelector('.add-task-btn');
            if (addBtn) addBtn.style.display = 'none';
            var taskList = col.querySelector('.task-list');
            if (taskList) taskList.appendChild(container);
            else col.appendChild(container);
        } else if (type === 'child') {
            var allNodes = document.querySelectorAll('.task-node');
            var nodeEl = null;
            for (var i = 0; i < allNodes.length; i++) {
                if (allNodes[i].dataset.taskId === String(parentId)) { nodeEl = allNodes[i]; break; }
            }
            if (!nodeEl) return;
            var childrenContainer = nodeEl.querySelector(':scope > .task-node-children');
            if (!childrenContainer) {
                childrenContainer = document.createElement('div');
                childrenContainer.className = 'task-node-children';
                nodeEl.appendChild(childrenContainer);
            }
            childrenContainer.appendChild(container);
            var parentTask = this.ds.getById(parentId);
            status = parentTask ? parentTask.Status : null;
        } else if (type === 'sibling') {
            var allNodes2 = document.querySelectorAll('.task-node');
            var anchorEl = null;
            for (var j = 0; j < allNodes2.length; j++) {
                if (allNodes2[j].dataset.taskId === String(anchorTaskId)) { anchorEl = allNodes2[j]; break; }
            }
            if (!anchorEl) {
                // anchor 못 찾으면 같은 그룹 마지막 태스크
                var siblings = this.ds.getRawTasks().filter(function (t) {
                    return t.ParentId === parentId && t.Status === status;
                }).sort(function (a, b) { return a.SortOrder - b.SortOrder; });
                if (siblings.length > 0) {
                    var lastId = siblings[siblings.length - 1].Id;
                    for (var k = 0; k < allNodes2.length; k++) {
                        if (allNodes2[k].dataset.taskId === String(lastId)) { anchorEl = allNodes2[k]; break; }
                    }
                }
            }
            if (!anchorEl) return;
            anchorEl.parentNode.insertBefore(container, anchorEl.nextSibling);
        }

        // 스크롤 보정 & 포커스
        var boardContainer = container.closest('.board-container');
        var savedScrollLeft = boardContainer ? boardContainer.scrollLeft : 0;
        var savedScrollTop = boardContainer ? boardContainer.scrollTop : 0; // 👈 세로 스크롤 상태 백업

        input.focus();

        if (boardContainer) {
            requestAnimationFrame(function () {
                boardContainer.scrollLeft = savedScrollLeft;
                boardContainer.scrollTop = savedScrollTop; // 👈 세로 스크롤 상태 복원
            });
        }

        // 이 입력창의 고유 ID
        var myId = ++self._quickAddId;

        // 상태 기록
        self._quickAddState = { type: type, status: status, parentId: parentId, anchorTaskId: anchorTaskId };

        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                var val = input.value.trim();
                if (val) {
                    var newTask;
                    if (type === 'column') {
                        newTask = self.ds.addTask(val, status, null);
                    } else if (type === 'child') {
                        newTask = self.ds.addTask(val, status, parentId);
                    } else if (type === 'sibling') {
                        newTask = self.ds.addTask(val, status, parentId);
                        // anchor 갱신
                        if (newTask && self._quickAddState) {
                            self._quickAddState.anchorTaskId = newTask.Id;
                        }
                    }
                    // addTask → _notify → render → _quickAddState로 입력창 자동 복원
                    // 이 시점에서 이 input은 이미 DOM에서 제거됨 (render가 innerHTML='' 함)
                    // blur가 발생하지만 myId가 stale이므로 무시됨
                } else {
                    // 빈 Enter → 종료
                    self._quickAddState = null;
                    if (container.parentNode) container.remove();
                    if (addBtn) addBtn.style.display = '';
                    self.render();
                }
            } else if (e.key === 'Escape') {
                self._quickAddState = null;
                if (container.parentNode) container.remove();
                if (addBtn) addBtn.style.display = '';
                self.render();
            }
        });

        // blur: stale 입력창만 처리 (render에 의해 DOM에서 떨어진 경우 무시)
        input.addEventListener('blur', function () {
            setTimeout(function () {
                // 이미 다음 세대 입력창이 열렸으면 이 blur는 무시
                if (self._quickAddId !== myId) return;
                // 아직 이 입력창이 현역인데 blur됨 = 사용자가 다른 곳 클릭
                var val = input.value.trim();
                if (val) {
                    if (type === 'column') {
                        self.ds.addTask(val, status, null);
                    } else {
                        self.ds.addTask(val, status, parentId);
                    }
                }
                self._quickAddState = null;
                if (container.parentNode) container.remove();
                if (addBtn) addBtn.style.display = '';
                // addTask이 이미 render를 트리거했으므로 val이 있으면 추가 render 불필요
                if (!val) self.render();
            }, 150);
        });
    }

    _renderHeader() {
        var header = document.createElement('div');
        header.className = 'board-header';

        var stats = document.createElement('div');
        stats.className = 'header-stats';

        var activeTasks = this.ds.getActiveTasks();
        var todayTasks = this.ds.getTodayTasks();
        var focusTasks = this.ds.getFocusTasks();

        stats.innerHTML =
            '<div class="stat-item">' +
            '<span class="stat-label">Active</span>' +
            '<span class="stat-value">' + activeTasks.length + '</span>' +
            '</div>' +
            '<span class="stat-separator">|</span>' +
            '<div class="stat-item">' +
            '<span class="stat-label">Today</span>' +
            '<span class="stat-value">' + todayTasks.length + '</span>' +
            '</div>' +
            '<span class="stat-separator">|</span>' +
            '<div class="stat-item">' +
            '<span class="stat-label">Focus</span>' +
            '<span class="stat-value">' + focusTasks.length + '</span>' +
            '</div>';

        var hasSelection = this.selectedIds.size > 0;

        var actions = document.createElement('div');
        actions.className = 'header-actions';
        actions.innerHTML =
            '<button class="btn-modern" id="btn-export" title="Export All (전체 백업)">📥 Export All</button>' +
            (hasSelection
                ? '<button class="btn-modern btn-export-selected" id="btn-export-selected" title="Export Selected Tasks">📋 Export Selected (' + this.selectedIds.size + ')</button>'
                : '') +
            '<button class="btn-modern" id="btn-import" title="Import">📤 Import</button>' +
            '<input type="file" id="import-file" accept=".json" style="display:none">' +
            '<button class="btn-modern" id="btn-undo" title="Undo (Ctrl+Z)" disabled>↩️ Undo</button>' +
            '<button class="btn-modern" id="btn-hide-completed">' + (this.hideCompleted ? '👁️ Show Completed' : '🙈 Hide Completed') + '</button>' +
            '<button class="btn-modern" id="btn-show-hidden" style="display:' + (this.showHidden ? 'inline-flex' : 'none') + '">' + (this.showHidden ? '👻 Hide Hidden' : '👻 Show Hidden') + '</button>';

        header.appendChild(stats);
        header.appendChild(actions);

        this._wireHeaderEvents(actions);

        return header;
    }

    _wireHeaderEvents(actions) {
        var self = this;
        var exportBtn = actions.querySelector('#btn-export');
        var exportSelectedBtn = actions.querySelector('#btn-export-selected');
        var importBtn = actions.querySelector('#btn-import');
        var importFile = actions.querySelector('#import-file');
        var undoBtn = actions.querySelector('#btn-undo');
        var hideCompletedBtn = actions.querySelector('#btn-hide-completed');
        var showHiddenBtn = actions.querySelector('#btn-show-hidden');

        if (exportBtn) exportBtn.addEventListener('click', function () { self._exportData(); });
        if (exportSelectedBtn) exportSelectedBtn.addEventListener('click', function () { self._exportSelectedData(); });

        if (importBtn) importBtn.addEventListener('click', function () { importFile.click(); });
        if (importFile) importFile.addEventListener('change', function (e) { self._importData(e); });
        if (undoBtn) {
            if (self.undo.canUndo()) undoBtn.disabled = false;
            undoBtn.addEventListener('click', function () {
                self.undo.undoLatest();
                self.render();
            });
        }
        if (hideCompletedBtn) {
            hideCompletedBtn.addEventListener('click', function () {
                self.hideCompleted = !self.hideCompleted;
                localStorage.setItem('gtd-hide-completed', String(self.hideCompleted));
                self.render();
            });
        }
        if (showHiddenBtn) {
            showHiddenBtn.addEventListener('click', function () {
                self.showHidden = !self.showHidden;
                localStorage.setItem('gtd-show-hidden', String(self.showHidden));
                self.render();
            });
        }
    }

    _renderColumn(title, tasks, status, isTodayColumn) {
        var self = this;
        var col = document.createElement('div');
        col.className = 'board-column';
        if (status) col.dataset.status = status;

        var colHeader = document.createElement('div');
        colHeader.className = 'column-header';

        var filteredTasks = this._filterTasks(tasks);

        var titleEl = document.createElement('h3');
        titleEl.textContent = title + ' (' + filteredTasks.length + ')';
        colHeader.appendChild(titleEl);

        if (status === TaskStatus.Completed) {
            var clearBtn = document.createElement('button');
            clearBtn.className = 'btn-clear-completed';
            clearBtn.textContent = '🗑️ Clear All';
            clearBtn.addEventListener('click', function () {
                if (confirm('완료된 모든 작업을 삭제하시겠습니까?')) {
                    var completedTasks = self.ds.getTasksForStatus(TaskStatus.Completed);
                    var snapshot = completedTasks.map(function (t) { return t.clone(); });
                    self.ds.deleteAllCompleted();
                    self.undo.push({
                        desc: 'Deleted ' + snapshot.length + ' completed tasks',
                        undo: function () { self.ds.restoreTasks(snapshot); }
                    });
                }
            });
            colHeader.appendChild(clearBtn);
        }

        col.appendChild(colHeader);

        var taskList = document.createElement('div');
        taskList.className = 'task-list';

        if (!isTodayColumn && status) {
            var topDropZone = document.createElement('div');
            topDropZone.className = 'column-drop-top';

            topDropZone.addEventListener('dragover', function (e) {
                e.preventDefault();
                e.stopPropagation();
                topDropZone.classList.add('drag-over-top');
            });
            topDropZone.addEventListener('dragleave', function () {
                topDropZone.classList.remove('drag-over-top');
            });
            topDropZone.addEventListener('drop', function (e) {
                e.preventDefault();
                e.stopPropagation();
                topDropZone.classList.remove('drag-over-top');
                var ids = self.dragDrop.getIdsToMove();
                if (ids.length > 0) {
                    self.ds.moveTasks(ids, status, null, 0);
                }
                self.dragDrop.endDrag();
            });
            taskList.appendChild(topDropZone);
        }

        if (!isTodayColumn && status) {
            taskList.addEventListener('dragover', function (e) {
                e.preventDefault();
                taskList.classList.add('drag-over-column');
            });
            taskList.addEventListener('dragleave', function (e) {
                if (!taskList.contains(e.relatedTarget)) {
                    taskList.classList.remove('drag-over-column');
                }
            });
            taskList.addEventListener('drop', function (e) {
                e.preventDefault();
                taskList.classList.remove('drag-over-column');
                var target = e.target;
                if (target.closest('.column-drop-top') || target.closest('.task-node-self')) {
                    return;
                }
                var ids = self.dragDrop.getIdsToMove();
                if (ids.length > 0) {
                    var siblings = self.ds.getRawTasks().filter(function (t) {
                        return t.ParentId == null && t.Status === status;
                    });
                    self.ds.moveTasks(ids, status, null, siblings.length);
                }
                self.dragDrop.endDrag();
            });
        }

        filteredTasks.forEach(function (task) {
            var node = self.nodeRenderer.render(task, {
                selectedIds: self.selectedIds,
                hideCompleted: self.hideCompleted,
                showHidden: self.showHidden,
                isMultiSelectMode: self.isMultiSelectMode
            });
            if (node) taskList.appendChild(node);
        });

        col.appendChild(taskList);

        if (status && status !== TaskStatus.Completed && !isTodayColumn) {
            var addBtn = document.createElement('button');
            addBtn.className = 'add-task-btn';
            addBtn.textContent = '+ Add Task';
            addBtn.addEventListener('click', function () {
                self._quickAddState = { type: 'column', status: status };
                self._attachQuickInput('column', status, null, null);
            });
            col.appendChild(addBtn);
        }

        return col;
    }

    _filterTasks(tasks) {
        var self = this;
        return tasks.filter(function (t) {
            if (self.hideCompleted && t.IsCompleted) return false;
            if (!self.showHidden && t.IsHidden) return false;
            return true;
        });
    }

    // ★★★ 기존 진입점들 — _attachQuickInput으로 위임 ★★★
    _showQuickAdd(column, status, addBtn) {
        this._quickAddState = { type: 'column', status: status };
        this._attachQuickInput('column', status, null, null);
    }

    _showChildQuickAdd(parent) {
        if (!parent.IsExpanded) {
            this.ds.updateExpandState(parent.Id, true);
            var self2 = this;
            this._quickAddState = { type: 'child', parentId: parent.Id };
            this.render();
            return;
        }
        this._quickAddState = { type: 'child', parentId: parent.Id };
        this._attachQuickInput('child', null, parent.Id, null);
    }

    _showSiblingQuickAdd(task) {
        this.selectedIds.clear();
        this.isMultiSelectMode = false;
        document.querySelectorAll('.task-node-self.is-selected, .task-node-self.is-multiselected').forEach(function (el) {
            el.classList.remove('is-selected', 'is-multiselected');
        });
        this._quickAddState = { type: 'sibling', anchorTaskId: task.Id, status: task.Status, parentId: task.ParentId };
        this._attachQuickInput('sibling', task.Status, task.ParentId, task.Id);
    }

    _handleTaskClick(task, e) {
        var self = this;
        if (e.ctrlKey || e.metaKey) {
            if (this.selectedIds.has(task.Id)) {
                this.selectedIds.delete(task.Id);
            } else {
                this.selectedIds.add(task.Id);
            }
            this.isMultiSelectMode = this.selectedIds.size > 0;
        } else if (e.shiftKey && this.lastClickedId !== null) {
            var list = this.renderedTasks;
            var lastId = this.lastClickedId;
            var startIdx = list.findIndex(function (t) { return t.Id === lastId; });
            var endIdx = list.findIndex(function (t) { return t.Id === task.Id; });
            if (startIdx !== -1 && endIdx !== -1) {
                var from = Math.min(startIdx, endIdx);
                var to = Math.max(startIdx, endIdx);
                for (var i = from; i <= to; i++) {
                    this.selectedIds.add(list[i].Id);
                }
            }
            this.isMultiSelectMode = true;
        } else {
            if (this.selectedIds.has(task.Id) && this.selectedIds.size === 1) {
                this.selectedIds.clear();
                this.isMultiSelectMode = false;
            } else {
                this.selectedIds.clear();
                this.selectedIds.add(task.Id);
                this.isMultiSelectMode = false;
            }
        }
        this.lastClickedId = task.Id;
        this.render();
    }

    _openModal(task) {
        var self = this;
        this.modal.open(task.Id, function () {
            self.render();
        });
    }

    _deleteTask(task) {
        var self = this;
        var snapshot = task.clone();
        var children = this.ds.getRawTasks().filter(function (t) { return t.ParentId === task.Id; }).map(function (t) { return t.clone(); });
        this.ds.deleteTask(task.Id);
        this.undo.push({
            desc: 'Deleted "' + task.Title + '"',
            undo: function () {
                self.ds.restoreTasks([snapshot].concat(children));
            }
        });
    }

    _handleDrop(targetId, position) {
        var movingIds = this.dragDrop.getIdsToMove();
        if (movingIds.length === 0) return;

        var targetTask = this.ds.getById(targetId);
        if (!targetTask) return;

        this.ds.moveTasks(movingIds, targetTask.Status, targetId, position);
        this.dragDrop.endDrag();
    }

    _renderBulkBar() {
        if (this.selectedIds.size < 1) return null;

        var self = this;
        var count = this.selectedIds.size;
        var bar = document.createElement('div');
        bar.className = 'bulk-action-bar';
        bar.innerHTML =
            '<span>' + count + ' task' + (count > 1 ? 's' : '') + ' selected</span>' +
            '<button class="btn-modern" id="bulk-export-btn">📋 Export Selected</button>' +
            (count >= 2 ? '<button class="btn-modern" id="bulk-edit-btn">✏️ Bulk Edit</button>' : '') +
            '<button class="btn-modern" id="bulk-delete-btn">🗑️ Delete</button>' +
            '<button class="btn-modern" id="bulk-cancel-btn">✖ Cancel</button>';

        bar.querySelector('#bulk-export-btn').addEventListener('click', function () {
            self._exportSelectedData();
        });

        var editBtn = bar.querySelector('#bulk-edit-btn');
        if (editBtn) {
            editBtn.addEventListener('click', function () {
                self.bulkPanel.show(
                    self.selectedIds,
                    function (model) {
                        var snapshots = [];
                        model.taskIds.forEach(function (id) {
                            var t = self.ds.getById(id);
                            if (t) snapshots.push(t.clone());
                        });
                        self.ds.bulkUpdate(model);
                        self.undo.push({
                            desc: 'Bulk edited ' + model.taskIds.length + ' tasks',
                            undo: function () { self.ds.restoreTasks(snapshots); }
                        });
                        self.selectedIds.clear();
                        self.render();
                    },
                    function () { }
                );
            });
        }

        bar.querySelector('#bulk-delete-btn').addEventListener('click', function () {
            if (confirm(self.selectedIds.size + '개 작업을 삭제하시겠습니까?')) {
                var ids = Array.from(self.selectedIds);
                var snapshots = ids.map(function (id) { return self.ds.getById(id); }).filter(Boolean).map(function (t) { return t.clone(); });
                self.ds.deleteTasks(ids);
                self.undo.push({
                    desc: 'Deleted ' + ids.length + ' tasks',
                    undo: function () { self.ds.restoreTasks(snapshots); }
                });
                self.selectedIds.clear();
                self.render();
            }
        });

        bar.querySelector('#bulk-cancel-btn').addEventListener('click', function () {
            self.selectedIds.clear();
            self.isMultiSelectMode = false;
            self.render();
        });

        return bar;
    }

    _buildRenderedList() {
        var all = [];
        var self = this;
        TaskStatusList.forEach(function (status) {
            var trees = self.ds.getTasksForStatus(status);
            var filtered = self._filterTasks(trees);
            var flatten = function (list) {
                list.forEach(function (t) {
                    all.push(t);
                    if (t.Children && t.Children.length > 0 && t.IsExpanded) {
                        flatten(t.Children);
                    }
                });
            };
            flatten(filtered);
        });
        return all;
    }

    deselectAll() {
        if (this.selectedIds.size > 0) {
            this.selectedIds.clear();
            this.isMultiSelectMode = false;
            this.render();
        }
    }

    _exportData() {
        try {
            var json = this.ds.exportToJson();
            var blob = new Blob([json], { type: 'application/json' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'gtd-backup-' + new Date().toISOString().slice(0, 10) + '.json';
            a.click();
            URL.revokeObjectURL(url);
            this.toast.success('Data exported successfully');
        } catch (e) {
            this.toast.error('Export failed: ' + e.message);
        }
    }

    _exportSelectedData() {
        try {
            var ids = Array.from(this.selectedIds);
            if (ids.length === 0) {
                this.toast.error('No tasks selected');
                return;
            }
            var json = this.ds.exportSelectedToJson(ids);
            var blob = new Blob([json], { type: 'application/json' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'gtd-selected-' + ids.length + '-tasks-' + new Date().toISOString().slice(0, 10) + '.json';
            a.click();
            URL.revokeObjectURL(url);
            this.toast.success(ids.length + ' tasks exported (with children)');
        } catch (e) {
            this.toast.error('Export failed: ' + e.message);
        }
    }

    _importData(e) {
        var self = this;
        var file = e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function (evt) {
            try {
                self.ds.importFromJson(evt.target.result);
                self.toast.success('데이터를 가져왔습니다');
                self.render();
            } catch (err) {
                self.toast.error('Import failed: ' + err.message);
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    }
}