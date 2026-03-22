class BoardView {
    constructor(dataService, undoService, toastService) {
        this.ds = dataService;
        this.undo = undoService;
        this.toast = toastService;
        this.dragDrop = new DragDropManager();
        this.modal = new TaskModal(dataService);
        this.bulkEdit = new BulkEditPanel();

        this.selectedIds = new Set();
        this.isMultiSelectMode = false;
        this.lastClickedId = null;
        this.renderedTasks = [];

        this.hideCompleted = JSON.parse(localStorage.getItem('gtd-hideCompleted') || 'false');
        this.showHidden = JSON.parse(localStorage.getItem('gtd-showHidden') || 'false');

        this.nodeRenderer = new TaskNodeRenderer(dataService, {
            onTaskClick: (id, e) => this._handleTaskClick(id, e),
            onDoubleClick: (id) => this._openModal(id),
            onToggleComplete: (id) => this.ds.toggleComplete(id),
            onDelete: (id) => this._deleteTask(id),
            onAddChild: (id, nodeEl) => this._showChildQuickAdd(id, nodeEl),
            onDragStart: (id, el) => this.dragDrop.startDrag(id, el),
            onDragEnd: () => this.dragDrop.endDrag(),
            onDrop: (targetId, position) => this._handleDrop(targetId, position),
            getDraggedId: () => this.dragDrop.getDraggedId(),
            onRefresh: () => this.render(),
        });
    }

    render() {
        var container = document.getElementById('content-area');
        if (!container) return;
        container.innerHTML = '';

        var home = document.createElement('div');
        home.className = 'home-container';

        home.appendChild(this._renderHeader());

        var board = document.createElement('div');
        board.className = 'board-container';

        var todayCol = this._renderColumn('Today', this.ds.getTodayTasks(), true);
        todayCol.classList.add('today-column');
        board.appendChild(todayCol);

        for (var s = 0; s < TaskStatusList.length; s++) {
            var status = TaskStatusList[s];
            var tasks = this.ds.getTasksForStatus(status);
            var col = this._renderColumn(status, tasks, false, status);
            board.appendChild(col);
        }

        home.appendChild(board);
        home.appendChild(this._renderBulkBar());
        container.appendChild(home);

        this.dragDrop.setSelectedIds(this.selectedIds);
        this._buildRenderedList();
    }

    _renderHeader() {
        var header = document.createElement('div');
        header.className = 'main-header modern-header';

        var activeTasks = this.ds.getActiveTasks(this.showHidden);
        var todayTasks = this.ds.getTodayTasks();
        var focusTasks = this.ds.getFocusTasks();

        header.innerHTML =
            '<div class="header-content">' +
                '<div class="header-left">' +
                    '<div class="app-logo">' +
                        '<div class="logo-icon"><span style="font-size:20px;color:white;">▦</span></div>' +
                        '<div class="logo-text">' +
                            '<h1 class="app-title">GTD Board</h1>' +
                            '<span class="app-subtitle">Getting Things Done</span>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="header-center">' +
                    '<div class="header-stats">' +
                        '<a class="stat-item-link" data-nav="active">' +
                            '<div class="stat-item">' +
                                '<span class="stat-number">' + activeTasks.length + '</span>' +
                                '<span class="stat-label">Active Tasks</span>' +
                            '</div>' +
                        '</a>' +
                        '<div class="stat-divider"></div>' +
                        '<div class="stat-item">' +
                            '<span class="stat-number">' + todayTasks.length + '</span>' +
                            '<span class="stat-label">Today</span>' +
                        '</div>' +
                        '<div class="stat-divider"></div>' +
                        '<a class="stat-item-link" data-nav="focus">' +
                            '<div class="stat-item">' +
                                '<span class="stat-number">' + focusTasks.length + '</span>' +
                                '<span class="stat-label">Focus</span>' +
                            '</div>' +
                        '</a>' +
                    '</div>' +
                '</div>' +
                '<div class="header-right">' +
                    '<div class="data-manager-btns">' +
                        '<button class="btn-modern" id="btn-export" title="Export">' +
                            '<span>↓</span><span class="btn-text">Export</span>' +
                        '</button>' +
                        '<button class="btn-modern" id="btn-import" title="Import">' +
                            '<span>↑</span><span class="btn-text">Import</span>' +
                        '</button>' +
                        '<input type="file" id="file-import" accept=".json" class="file-input-hidden" />' +
                    '</div>' +
                    '<button class="btn-modern" id="btn-undo" title="실행 취소" ' + (this.undo.canUndo() ? '' : 'disabled') + '>' +
                        '<span>↶</span>' +
                    '</button>' +
                    '<button class="btn-modern" id="btn-hide-completed" title="' + (this.hideCompleted ? 'Show completed' : 'Hide completed') + '">' +
                        '<span>' + (this.hideCompleted ? '👁' : '🙈') + '</span>' +
                        '<span class="btn-text">' + (this.hideCompleted ? 'Show' : 'Hide') + '</span>' +
                    '</button>' +
                    '<button class="btn-modern" id="btn-show-hidden" title="' + (this.showHidden ? 'Hide hidden' : 'Show hidden') + '">' +
                        '<span>' + (this.showHidden ? '👁' : '🙈') + '</span>' +
                        '<span class="btn-text">Hidden</span>' +
                    '</button>' +
                '</div>' +
            '</div>';

        setTimeout(() => this._wireHeaderEvents(), 0);
        return header;
    }

    _wireHeaderEvents() {
        var self = this;
        var exportBtn = document.getElementById('btn-export');
        if (exportBtn) exportBtn.addEventListener('click', function() { self._exportData(); });

        var importBtn = document.getElementById('btn-import');
        if (importBtn) importBtn.addEventListener('click', function() {
            var fileInput = document.getElementById('file-import');
            if (fileInput) fileInput.click();
        });

        var fileInput = document.getElementById('file-import');
        if (fileInput) fileInput.addEventListener('change', function(e) { self._importData(e); });

        var undoBtn = document.getElementById('btn-undo');
        if (undoBtn) undoBtn.addEventListener('click', function() { self.undo.undoLatest(); });

        var hideBtn = document.getElementById('btn-hide-completed');
        if (hideBtn) hideBtn.addEventListener('click', function() {
            self.hideCompleted = !self.hideCompleted;
            localStorage.setItem('gtd-hideCompleted', JSON.stringify(self.hideCompleted));
            self.render();
        });

        var showBtn = document.getElementById('btn-show-hidden');
        if (showBtn) showBtn.addEventListener('click', function() {
            self.showHidden = !self.showHidden;
            localStorage.setItem('gtd-showHidden', JSON.stringify(self.showHidden));
            self.render();
        });

        document.querySelectorAll('[data-nav]').forEach(function(el) {
            el.addEventListener('click', function(e) {
                e.preventDefault();
                var nav = el.dataset.nav;
                if (window.app) window.app.navigate(nav);
            });
        });
    }

    _renderColumn(title, tasks, isTodayCol, status) {
        var col = document.createElement('div');
        col.className = 'board-column';
        if (status) col.dataset.status = status;

        if (status === TaskStatus.Completed) {
            var headerDiv = document.createElement('div');
            headerDiv.className = 'column-header-with-action';
            headerDiv.innerHTML = '<h3 class="column-header">' + title + '</h3>';
            var clearBtn = document.createElement('button');
            clearBtn.className = 'btn-clear-completed';
            clearBtn.title = 'Clear all completed';
            clearBtn.innerHTML = '🗑';
            clearBtn.addEventListener('click', () => {
                if (confirm('완료된 모든 항목을 삭제하시겠습니까?')) {
                    this.ds.deleteAllCompleted();
                }
            });
            headerDiv.appendChild(clearBtn);
            col.appendChild(headerDiv);
        } else {
            var h = document.createElement('h3');
            h.className = 'column-header';
            h.textContent = title;
            col.appendChild(h);
        }

        var list = document.createElement('div');
        list.className = 'task-list';

        var filteredTasks = this._filterTasks(tasks);
        for (var i = 0; i < filteredTasks.length; i++) {
            var node = this.nodeRenderer.render(filteredTasks[i], {
                hideCompleted: this.hideCompleted,
                showHidden: this.showHidden,
                selectedIds: this.selectedIds,
                isMultiSelectMode: this.isMultiSelectMode,
            });
            if (node) list.appendChild(node);
        }
        col.appendChild(list);

        if (status) {
            col.addEventListener('dragover', (e) => {
                e.preventDefault();
                col.classList.add('drag-over');
            });
            col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
            col.addEventListener('drop', (e) => {
                e.preventDefault();
                col.classList.remove('drag-over');
                var idsToMove = this.dragDrop.getIdsToMove();
                if (idsToMove.length > 0) {
                    var siblings = this.ds.getTasksForStatus(status);
                    this.ds.moveTasks(idsToMove, status, null, siblings.length);
                }
                this.dragDrop.endDrag();
            });

            if (!isTodayCol) {
                var addBtn = document.createElement('button');
                addBtn.className = 'add-task-btn';
                addBtn.textContent = '+ Add Task';
                addBtn.addEventListener('click', () => this._showQuickAdd(col, status));
                col.appendChild(addBtn);
            }
        }

        return col;
    }

    _filterTasks(tasks) {
        var result = tasks;
        if (this.hideCompleted) result = result.filter(function(t) { return !t.IsCompleted; });
        if (!this.showHidden) result = result.filter(function(t) { return !t.IsHidden; });
        return result;
    }

    _showQuickAdd(colEl, status) {
        var self = this;
        colEl.querySelectorAll('.quick-add-container').forEach(function(e) { e.remove(); });
        var addBtn = colEl.querySelector('.add-task-btn');
        if (addBtn) addBtn.style.display = 'none';

        var container = document.createElement('div');
        container.className = 'quick-add-container';
        var input = document.createElement('input');
        input.placeholder = 'Enter a title...';

        var submitted = false;
        input.addEventListener('keyup', function(e) {
            if (e.key === 'Enter' && input.value.trim()) {
                submitted = true;
                self.ds.addTask(input.value.trim(), status, null);
                input.value = '';
                submitted = false;
                input.focus();
            } else if (e.key === 'Escape') {
                submitted = true;
                container.remove();
                if (addBtn) addBtn.style.display = '';
            }
        });
        input.addEventListener('blur', function() {
            if (!submitted && input.value.trim()) {
                self.ds.addTask(input.value.trim(), status, null);
            }
            container.remove();
            if (addBtn) addBtn.style.display = '';
        });
        container.appendChild(input);
        colEl.appendChild(container);
        setTimeout(function() { input.focus(); }, 50);
    }

    _showChildQuickAdd(parentId, nodeEl) {
        var self = this;
        var parent = this.ds.getById(parentId);
        if (!parent) return;
        if (!parent.IsExpanded) {
            parent.IsExpanded = true;
            this.ds.updateExpandState(parentId, true);
            this.render();
            return;
        }

        var childrenEl = nodeEl.querySelector('.task-node-children');
        if (!childrenEl) {
            childrenEl = document.createElement('div');
            childrenEl.className = 'task-node-children';
            nodeEl.appendChild(childrenEl);
        }

        childrenEl.querySelectorAll('.quick-add-container').forEach(function(e) { e.remove(); });

        var container = document.createElement('div');
        container.className = 'quick-add-container child-add';
        var input = document.createElement('input');
        input.placeholder = 'Add a sub-task...';

        var submitted = false;
        input.addEventListener('keyup', function(e) {
            if (e.key === 'Enter' && input.value.trim()) {
                submitted = true;
                self.ds.addTask(input.value.trim(), parent.Status, parentId);
                input.value = '';
                submitted = false;
                input.focus();
            } else if (e.key === 'Escape') {
                submitted = true;
                container.remove();
            }
        });
        input.addEventListener('blur', function() {
            if (!submitted && input.value.trim()) {
                self.ds.addTask(input.value.trim(), parent.Status, parentId);
            }
            container.remove();
        });
        container.appendChild(input);
        childrenEl.appendChild(container);
        setTimeout(function() { input.focus(); }, 50);
    }

    _handleTaskClick(taskId, e) {
        if (this.isMultiSelectMode || e.ctrlKey || e.metaKey || e.shiftKey) {
            if (e.shiftKey && this.lastClickedId != null) {
                var lastIdx = this.renderedTasks.findIndex(function(t) { return t.Id === this.lastClickedId; }.bind(this));
                var curIdx = this.renderedTasks.findIndex(function(t) { return t.Id === taskId; });
                if (lastIdx !== -1 && curIdx !== -1) {
                    var start = Math.min(lastIdx, curIdx);
                    var end = Math.max(lastIdx, curIdx);
                    if (!e.ctrlKey && !e.metaKey) this.selectedIds.clear();
                    for (var i = start; i <= end; i++) {
                        this.selectedIds.add(this.renderedTasks[i].Id);
                    }
                }
            } else {
                if (this.selectedIds.has(taskId)) this.selectedIds.delete(taskId);
                else this.selectedIds.add(taskId);
            }
        } else {
            this.selectedIds.clear();
            this.selectedIds.add(taskId);
        }
        this.lastClickedId = taskId;
        this.render();
    }

    _openModal(taskId) {
        this.modal.open(taskId, function() {});
    }

    _deleteTask(id) {
        var snapshot = this.ds.deleteTask(id);
        this.undo.push({
            description: '작업 삭제됨',
            undo: () => this.ds.restoreTasks(snapshot)
        });
    }

    _handleDrop(targetTaskId, position) {
        var idsToMove = this.dragDrop.getIdsToMove();
        if (idsToMove.length === 0) return;
        if (idsToMove.includes(targetTaskId)) return;

        var target = this.ds.getById(targetTaskId);
        if (!target) return;

        var parentId, sortOrder;
        switch (position) {
            case 'Inside':
                parentId = target.Id;
                sortOrder = this.ds.getRawTasks().filter(function(t) { return t.ParentId === target.Id; }).length;
                break;
            case 'Above':
                parentId = target.ParentId;
                sortOrder = target.SortOrder;
                break;
            case 'Below':
                parentId = target.ParentId;
                sortOrder = target.SortOrder + 1;
                break;
        }
        this.ds.moveTasks(idsToMove, target.Status, parentId, sortOrder);
        this.dragDrop.endDrag();
    }

    _renderBulkBar() {
        var self = this;
        var bar = document.createElement('div');
        bar.className = 'bulk-action-bar ' + (this.selectedIds.size > 1 || this.isMultiSelectMode ? 'visible' : '');
        bar.innerHTML =
            '<div class="bar-content">' +
                '<span class="selection-count">' + this.selectedIds.size + '개 선택됨</span>' +
                '<div class="actions">' +
                    '<button id="bulk-edit-btn">✎ 일괄 편집</button>' +
                    '<button class="danger" id="bulk-delete-btn">🗑 삭제</button>' +
                '</div>' +
            '</div>' +
            '<button class="close-btn" id="bulk-deselect">×</button>';

        setTimeout(function() {
            var editBtn = document.getElementById('bulk-edit-btn');
            if (editBtn) editBtn.addEventListener('click', function() {
                self.bulkEdit.show(self.selectedIds, function(model) {
                    self.ds.bulkUpdate(model);
                }, function() { self.bulkEdit.hide(); });
            });

            var delBtn = document.getElementById('bulk-delete-btn');
            if (delBtn) delBtn.addEventListener('click', function() {
                if (confirm(self.selectedIds.size + '개의 항목을 삭제하시겠습니까?')) {
                    var snapshot = self.ds.deleteTasks([...self.selectedIds]);
                    self.undo.push({
                        description: snapshot.length + '개 작업 삭제됨',
                        undo: function() { self.ds.restoreTasks(snapshot); }
                    });
                    self.selectedIds.clear();
                    self.isMultiSelectMode = false;
                }
            });

            var deselectBtn = document.getElementById('bulk-deselect');
            if (deselectBtn) deselectBtn.addEventListener('click', function() {
                self.selectedIds.clear();
                self.isMultiSelectMode = false;
                self.render();
            });
        }, 0);

        return bar;
    }

    _buildRenderedList() {
        this.renderedTasks = [];
        var tree = this.ds.getAllTasks();
        var todayTasks = this.ds.getTodayTasks();
        var self = this;

        var flatten = function(items) {
            for (var i = 0; i < items.length; i++) {
                self.renderedTasks.push(items[i]);
                if (items[i].IsExpanded && items[i].Children.length > 0) {
                    flatten(items[i].Children);
                }
            }
        };
        flatten(todayTasks);
        for (var s = 0; s < TaskStatusList.length; s++) {
            flatten(this.ds.getTasksForStatus(TaskStatusList[s]));
        }
        var seen = new Set();
        this.renderedTasks = this.renderedTasks.filter(function(t) {
            if (seen.has(t.Id)) return false;
            seen.add(t.Id);
            return true;
        });
    }

    deselectAll() {
        this.selectedIds.clear();
        this.isMultiSelectMode = false;
        this.lastClickedId = null;
        this.bulkEdit.hide();
        this.render();
    }

    _exportData() {
        var json = this.ds.exportToJson();
        var blob = new Blob([json], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'gtd-tasks-' + new Date().toISOString().split('T')[0] + '.json';
        a.click();
        URL.revokeObjectURL(url);
        this.toast.success('데이터를 내보냈습니다.');
    }

    _importData(e) {
        var self = this;
        var file = e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function(evt) {
            try {
                self.ds.importFromJson(evt.target.result);
                self.toast.success('데이터를 가져왔습니다.');
            } catch (err) {
                self.toast.error('가져오기 실패: ' + err.message);
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    }
}
