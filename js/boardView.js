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

        var self = this;
        this.nodeRenderer = new TaskNodeRenderer(dataService, {
            onTaskClick: function(id, e) { self._handleTaskClick(id, e); },
            onDoubleClick: function(id) { self._openModal(id); },
            onToggleComplete: function(id) { self.ds.toggleComplete(id); },
            onDelete: function(id) { self._deleteTask(id); },
            onAddChild: function(id, nodeEl) { self._showChildQuickAdd(id, nodeEl); },
            onDragStart: function(id, el) {
                self.dragDrop.setSelectedIds(self.selectedIds);
                self.dragDrop.startDrag(id, el);
            },
            onDragEnd: function() { self.dragDrop.endDrag(); },
            onDrop: function(targetId, position) { self._handleDrop(targetId, position); },
            getDraggedId: function() { return self.dragDrop.getDraggedId(); },
            onRefresh: function() { self.render(); },
            // ★ 새 콜백: 칼럼 상단 드롭
            onDropColumnTop: function(status) {
                var ids = self.dragDrop.getIdsToMove();
                if (ids.length > 0) {
                    self.ds.moveTasks(ids, status, null, 0);
                }
                self.dragDrop.endDrag();
            },
            // ★ 새 콜백: 칼럼 빈 영역 드롭
            onDropColumnEmpty: function(status) {
                var ids = self.dragDrop.getIdsToMove();
                if (ids.length > 0) {
                    var siblings = self.ds.getTasksForStatus(status);
                    self.ds.moveTasks(ids, status, null, siblings.length);
                }
                self.dragDrop.endDrag();
            }
        });
    }

    // ── 이하 모든 메서드 기존과 동일 ──

    render() {
        var container = document.getElementById('content-area');
        if (!container) return;
        container.innerHTML = '';

        var home = document.createElement('div');
        home.className = 'home-container';

        home.appendChild(this._renderHeader());

        var board = document.createElement('div');
        board.className = 'board-container';

        var todayTasks = this.ds.getTodayTasks();
        var todayCol = this._renderColumn('오늘 할 일', todayTasks, null, true);
        todayCol.classList.add('today-column');
        board.appendChild(todayCol);

        for (var s = 0; s < TaskStatusList.length; s++) {
            var status = TaskStatusList[s];
            var tasks = this.ds.getTasksForStatus(status);
            var col = this._renderColumn(status, tasks, status, false);
            board.appendChild(col);
        }

        home.appendChild(board);

        var bulkBar = this._renderBulkBar();
        if (bulkBar) home.appendChild(bulkBar);

        container.appendChild(home);

        this.dragDrop.setSelectedIds(this.selectedIds);
        this.renderedTasks = this._buildRenderedList();
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
                                '<span class="stat-label">Active</span>' +
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
                            '<span>↓</span><span class="btn-text"> Export</span>' +
                        '</button>' +
                        '<button class="btn-modern" id="btn-import" title="Import">' +
                            '<span>↑</span><span class="btn-text"> Import</span>' +
                        '</button>' +
                        '<input type="file" id="file-import" accept=".json" class="file-input-hidden" />' +
                    '</div>' +
                    '<button class="btn-modern" id="btn-undo" title="Undo" ' + (this.undo.canUndo() ? '' : 'disabled') + '>' +
                        '<span>↶</span>' +
                    '</button>' +
                    '<button class="btn-modern" id="btn-hide-completed">' +
                        '<span>' + (this.hideCompleted ? '👁' : '🙈') + '</span>' +
                        '<span class="btn-text"> ' + (this.hideCompleted ? 'Show' : 'Hide') + '</span>' +
                    '</button>' +
                '</div>' +
            '</div>';

        var self = this;
        setTimeout(function() {
            var exportBtn = document.getElementById('btn-export');
            if (exportBtn) exportBtn.addEventListener('click', function() { self._exportData(); });

            var importBtn = document.getElementById('btn-import');
            if (importBtn) importBtn.addEventListener('click', function() {
                var f = document.getElementById('file-import');
                if (f) f.click();
            });

            var fileInput = document.getElementById('file-import');
            if (fileInput) fileInput.addEventListener('change', function(e) { self._importData(e); });

            var undoBtn = document.getElementById('btn-undo');
            if (undoBtn) undoBtn.addEventListener('click', function() { self.undo.undoLatest(); });

            var hideBtn = document.getElementById('btn-hide-completed');
            if (hideBtn) hideBtn.addEventListener('click', function() {
                self.hideCompleted = !self.hideCompleted;
                localStorage.setItem('gtd-hide-completed', String(self.hideCompleted));
                self.render();
            });

            document.querySelectorAll('[data-nav]').forEach(function(el) {
                el.addEventListener('click', function(e) {
                    e.preventDefault();
                    if (window.app) window.app.navigate(el.dataset.nav);
                });
            });
        }, 0);

        return header;
    }

    _renderColumn(title, tasks, status, isTodayCol) {
        var col = document.createElement('div');
        col.className = 'board-column';
        if (status) col.dataset.status = status;

        var filteredTasks = this._filterTasks(tasks);

        if (status === TaskStatus.Completed) {
            var headerDiv = document.createElement('div');
            headerDiv.className = 'column-header-with-action';
            var h3 = document.createElement('h3');
            h3.className = 'column-header';
            h3.textContent = title + ' (' + filteredTasks.length + ')';
            headerDiv.appendChild(h3);
            var clearBtn = document.createElement('button');
            clearBtn.className = 'btn-clear-completed';
            clearBtn.textContent = '🗑';
            clearBtn.title = 'Clear all completed';
            var self = this;
            clearBtn.addEventListener('click', function() {
                if (confirm('완료된 모든 항목을 삭제하시겠습니까?')) {
                    self.ds.deleteAllCompleted();
                }
            });
            headerDiv.appendChild(clearBtn);
            col.appendChild(headerDiv);
        } else {
            var h3 = document.createElement('h3');
            h3.className = 'column-header';
            h3.textContent = title + ' (' + filteredTasks.length + ')';
            col.appendChild(h3);
        }

        var taskList = document.createElement('div');
        taskList.className = 'task-list';
        var topDropHandled = false;

        if (status && !isTodayCol && filteredTasks.length > 0) {
            var self = this;
            var dropTop = document.createElement('div');
            dropTop.className = 'column-drop-top';
            dropTop.addEventListener('dragover', function(e) {
                e.preventDefault();
                e.stopPropagation();
                dropTop.classList.add('drag-over-top');
            });
            dropTop.addEventListener('dragleave', function() {
                dropTop.classList.remove('drag-over-top');
            });
            dropTop.addEventListener('drop', function(e) {
                e.preventDefault();
                e.stopPropagation();
                dropTop.classList.remove('drag-over-top');
                var ids = self.dragDrop.getIdsToMove();
                if (ids.length > 0) {
                    self.ds.moveTasks(ids, status, null, 0);
                }
                self.dragDrop.endDrag();
                topDropHandled = true;
            });
            taskList.appendChild(dropTop);
        }

        for (var i = 0; i < filteredTasks.length; i++) {
            var node = this.nodeRenderer.render(filteredTasks[i], {
                hideCompleted: this.hideCompleted,
                showHidden: this.showHidden,
                selectedIds: this.selectedIds,
                isMultiSelectMode: this.isMultiSelectMode
            });
            if (node) taskList.appendChild(node);
        }

        col.appendChild(taskList);

        if (status && !isTodayCol) {
            var self = this;
            taskList.addEventListener('dragover', function(e) {
                e.preventDefault();
                taskList.classList.add('drag-over-column');
            });
            taskList.addEventListener('dragleave', function() {
                taskList.classList.remove('drag-over-column');
            });
            taskList.addEventListener('drop', function(e) {
                if (topDropHandled) {
                    topDropHandled = false;
                    return;
                }
                e.preventDefault();
                taskList.classList.remove('drag-over-column');
                var ids = self.dragDrop.getIdsToMove();
                if (ids.length > 0) {
                    var siblings = self.ds.getTasksForStatus(status);
                    self.ds.moveTasks(ids, status, null, siblings.length);
                }
                self.dragDrop.endDrag();
            });
        }

        if (status && status !== TaskStatus.Completed && !isTodayCol) {
            var self = this;
            var addBtn = document.createElement('button');
            addBtn.className = 'add-task-btn';
            addBtn.textContent = '+ Add Task';
            addBtn.addEventListener('click', function() { self._showQuickAdd(col, status, addBtn); });
            col.appendChild(addBtn);
        }

        return col;
    }

    _filterTasks(tasks) {
        var self = this;
        return tasks.filter(function(t) {
            if (self.hideCompleted && t.IsCompleted) return false;
            if (!self.showHidden && t.IsHidden) return false;
            return true;
        });
    }

    _showQuickAdd(column, status, addBtn) {
        var self = this;
        if (addBtn) addBtn.style.display = 'none';

        var container = document.createElement('div');
        container.className = 'quick-add-container';
        var input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'New task title...';
        container.appendChild(input);
        column.appendChild(container);
        input.focus();

        var done = false;
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (input.value.trim() && !done) {
                    done = true;
                    self.ds.addTask(input.value.trim(), status, null);
                    input.value = '';
                    done = false;
                    input.focus();
                }
            } else if (e.key === 'Escape') {
                done = true;
                input.blur();
            }
        });
        input.addEventListener('blur', function() {
            setTimeout(function() {
                if (!done && input.value.trim()) {
                    self.ds.addTask(input.value.trim(), status, null);
                }
                container.remove();
                if (addBtn) addBtn.style.display = '';
            }, 150);
        });
    }

    _showChildQuickAdd(parentId, nodeEl) {
        var self = this;
        var parent = this.ds.getById(parentId);
        if (!parent) return;

        if (!parent.IsExpanded) {
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

        var container = document.createElement('div');
        container.className = 'quick-add-container child-add';
        var input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'New subtask...';
        container.appendChild(input);
        childrenEl.appendChild(container);
        input.focus();

        var done = false;
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (input.value.trim() && !done) {
                    done = true;
                    self.ds.addTask(input.value.trim(), parent.Status, parentId);
                    input.value = '';
                    done = false;
                    input.focus();
                }
            } else if (e.key === 'Escape') {
                done = true;
                input.blur();
            }
        });
        input.addEventListener('blur', function() {
            setTimeout(function() {
                if (!done && input.value.trim()) {
                    self.ds.addTask(input.value.trim(), parent.Status, parentId);
                }
                container.remove();
            }, 150);
        });
    }

    _handleTaskClick(taskId, e) {
        if (e.ctrlKey || e.metaKey) {
            if (this.selectedIds.has(taskId)) this.selectedIds.delete(taskId);
            else this.selectedIds.add(taskId);
            this.isMultiSelectMode = this.selectedIds.size > 0;
        } else if (e.shiftKey && this.lastClickedId !== null) {
            var list = this.renderedTasks;
            var self = this;
            var startIdx = list.findIndex(function(t) { return t.Id === self.lastClickedId; });
            var endIdx = list.findIndex(function(t) { return t.Id === taskId; });
            if (startIdx !== -1 && endIdx !== -1) {
                var from = Math.min(startIdx, endIdx);
                var to = Math.max(startIdx, endIdx);
                for (var i = from; i <= to; i++) {
                    this.selectedIds.add(list[i].Id);
                }
            }
            this.isMultiSelectMode = true;
        } else {
            if (this.selectedIds.has(taskId) && this.selectedIds.size === 1) {
                this.selectedIds.clear();
                this.isMultiSelectMode = false;
            } else {
                this.selectedIds.clear();
                this.selectedIds.add(taskId);
                this.isMultiSelectMode = false;
            }
        }
        this.lastClickedId = taskId;
        this.render();
    }

    _openModal(taskId) {
        var self = this;
        this.modal.open(taskId, function() { self.render(); });
    }

    _deleteTask(taskId) {
        var snapshot = this.ds.deleteTask(taskId);
        var self = this;
        this.undo.push({
            description: '작업 삭제됨',
            undo: function() { self.ds.restoreTasks(snapshot); }
        });
    }

    _handleDrop(targetId, position) {
        var ids = this.dragDrop.getIdsToMove();
        if (ids.length === 0) return;

        var target = this.ds.getById(targetId);
        if (!target) return;

        var newStatus = target.Status;
        var newParentId;
        var newSortOrder;

        if (position === 'Inside') {
            newParentId = target.Id;
            var existingChildren = this.ds.getRawTasks().filter(function(t) {
                return t.ParentId === target.Id;
            });
            newSortOrder = existingChildren.length;
        } else {
            newParentId = target.ParentId;
            var siblings = this.ds.getRawTasks().filter(function(t) {
                return t.ParentId === target.ParentId && t.Status === target.Status;
            }).sort(function(a, b) { return a.SortOrder - b.SortOrder; });

            var targetIdx = -1;
            for (var i = 0; i < siblings.length; i++) {
                if (siblings[i].Id === target.Id) {
                    targetIdx = i;
                    break;
                }
            }

            if (position === 'Above') {
                newSortOrder = targetIdx >= 0 ? targetIdx : 0;
            } else {
                newSortOrder = targetIdx >= 0 ? targetIdx + 1 : siblings.length;
            }
        }

        this.ds.moveTasks(ids, newStatus, newParentId, newSortOrder);
        this.dragDrop.endDrag();
    }

    _renderBulkBar() {
        if (this.selectedIds.size < 2) return null;

        var bar = document.createElement('div');
        bar.className = 'bulk-action-bar visible';
        bar.innerHTML =
            '<div class="bar-content">' +
                '<span class="selection-count">' + this.selectedIds.size + '개 선택됨</span>' +
                '<div class="actions">' +
                    '<button id="bulk-edit-btn">✎ 일괄 편집</button>' +
                    '<button class="danger" id="bulk-delete-btn">🗑 삭제</button>' +
                '</div>' +
            '</div>' +
            '<button class="close-btn" id="bulk-deselect">×</button>';

        var self = this;
        setTimeout(function() {
            var editBtn = document.getElementById('bulk-edit-btn');
            if (editBtn) editBtn.addEventListener('click', function() {
                self.bulkPanel.show(self.selectedIds, function(model) {
                    self.ds.bulkUpdate(model);
                    self.selectedIds.clear();
                    self.render();
                }, function() {});
            });

            var delBtn = document.getElementById('bulk-delete-btn');
            if (delBtn) delBtn.addEventListener('click', function() {
                if (confirm(self.selectedIds.size + '개의 항목을 삭제하시겠습니까?')) {
                    var ids = Array.from(self.selectedIds);
                    var snapshot = self.ds.deleteTasks(ids);
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
        var all = [];
        var self = this;
        var flatten = function(list) {
            for (var i = 0; i < list.length; i++) {
                all.push(list[i]);
                if (list[i].Children && list[i].Children.length > 0 && list[i].IsExpanded) {
                    flatten(list[i].Children);
                }
            }
        };
        for (var s = 0; s < TaskStatusList.length; s++) {
            var tasks = self.ds.getTasksForStatus(TaskStatusList[s]);
            var filtered = self._filterTasks(tasks);
            flatten(filtered);
        }
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
            this.toast.success('데이터를 내보냈습니다.');
        } catch (e) {
            this.toast.error('Export 실패: ' + e.message);
        }
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
                self.toast.error('Import 실패: ' + err.message);
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    }
}
