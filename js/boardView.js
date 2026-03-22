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
            onTaskClick: function(taskId, e) {
                var task = self.ds.getById(taskId);
                if (task) self._handleTaskClick(task, e);
            },
            onDoubleClick: function(taskId) {
                var task = self.ds.getById(taskId);
                if (task) self._openModal(task);
            },
            onToggleComplete: function(taskId) {
                self.ds.toggleComplete(taskId);
            },
            onDelete: function(taskId) {
                var task = self.ds.getById(taskId);
                if (task) self._deleteTask(task);
            },
            onAddChild: function(taskId) {
                var task = self.ds.getById(taskId);
                if (task) self._showChildQuickAdd(task);
            },
            onDragStart: function(taskId, el) {
                self.dragDrop.setSelectedIds(self.selectedIds);
                self.dragDrop.startDrag(taskId, el);
            },
            onDragEnd: function() { self.dragDrop.endDrag(); },
            onDrop: function(targetId, position) { self._handleDrop(targetId, position); },
            getDraggedId: function() { return self.dragDrop.getDraggedId(); },
            onRefresh: function() { self.render(); },
            // ★ 모바일 터치: 칼럼 상단/빈 영역 드롭 콜백 ★
            onDropColumnTop: function(status) {
                var ids = self.dragDrop.getIdsToMove();
                if (ids.length > 0 && status) {
                    self.ds.moveTasks(ids, status, null, 0);
                }
                self.dragDrop.endDrag();
            },
            onDropColumnEmpty: function(status) {
                var ids = self.dragDrop.getIdsToMove();
                if (ids.length > 0 && status) {
                    // 칼럼 빈 영역 = 맨 아래에 추가
                    var siblings = self.ds.getRawTasks().filter(function(t) {
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
        container.innerHTML = '';

        var wrapper = document.createElement('div');
        wrapper.className = 'board-container';

        var header = this._renderHeader();
        wrapper.appendChild(header);

        var columnsRow = document.createElement('div');
        columnsRow.className = 'board-columns';

        // Today column
        var todayTasks = this.ds.getTodayTasks();
        var todayCol = this._renderColumn('오늘 할 일', todayTasks, null, true);
        todayCol.classList.add('today-column');
        columnsRow.appendChild(todayCol);

        // Status columns
        var self = this;
        TaskStatusList.forEach(function(status) {
            var tasks = self.ds.getTasksForStatus(status);
            var col = self._renderColumn(status, tasks, status, false);
            columnsRow.appendChild(col);
        });

        wrapper.appendChild(columnsRow);

        // Bulk action bar
        var bulkBar = this._renderBulkBar();
        if (bulkBar) wrapper.appendChild(bulkBar);

        container.appendChild(wrapper);

        this.dragDrop.setSelectedIds(this.selectedIds);
        this.renderedTasks = this._buildRenderedList();
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

        var actions = document.createElement('div');
        actions.className = 'header-actions';
        actions.innerHTML =
            '<button class="btn-modern" id="btn-export" title="Export">📥 Export</button>' +
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
        var importBtn = actions.querySelector('#btn-import');
        var importFile = actions.querySelector('#import-file');
        var undoBtn = actions.querySelector('#btn-undo');
        var hideCompletedBtn = actions.querySelector('#btn-hide-completed');
        var showHiddenBtn = actions.querySelector('#btn-show-hidden');

        if (exportBtn) exportBtn.addEventListener('click', function() { self._exportData(); });
        if (importBtn) importBtn.addEventListener('click', function() { importFile.click(); });
        if (importFile) importFile.addEventListener('change', function(e) { self._importData(e); });
        if (undoBtn) {
            if (self.undo.canUndo()) undoBtn.disabled = false;
            undoBtn.addEventListener('click', function() {
                self.undo.undoLatest();
                self.render();
            });
        }
        if (hideCompletedBtn) {
            hideCompletedBtn.addEventListener('click', function() {
                self.hideCompleted = !self.hideCompleted;
                localStorage.setItem('gtd-hide-completed', self.hideCompleted);
                self.render();
            });
        }
        if (showHiddenBtn) {
            showHiddenBtn.addEventListener('click', function() {
                self.showHidden = !self.showHidden;
                localStorage.setItem('gtd-show-hidden', self.showHidden);
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
            clearBtn.addEventListener('click', function() {
                if (confirm('완료된 모든 작업을 삭제하시겠습니까?')) {
                    var completedTasks = self.ds.getTasksForStatus(TaskStatus.Completed);
                    var snapshot = completedTasks.map(function(t) { return t.clone(); });
                    self.ds.deleteAllCompleted();
                    self.undo.push({
                        desc: 'Deleted ' + snapshot.length + ' completed tasks',
                        undo: function() { self.ds.restoreTasks(snapshot); }
                    });
                }
            });
            colHeader.appendChild(clearBtn);
        }

        col.appendChild(colHeader);

        var taskList = document.createElement('div');
        taskList.className = 'task-list';

        // ★★★ 칼럼 상단 드롭존 (데스크탑 drag용) ★★★
        if (!isTodayColumn && status) {
            var topDropZone = document.createElement('div');
            topDropZone.className = 'column-drop-top';

            topDropZone.addEventListener('dragover', function(e) {
                e.preventDefault();
                e.stopPropagation();
                topDropZone.classList.add('drag-over-top');
            });
            topDropZone.addEventListener('dragleave', function() {
                topDropZone.classList.remove('drag-over-top');
            });
            topDropZone.addEventListener('drop', function(e) {
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

        // 칼럼 빈 영역 드롭 (데스크탑 drag용)
        if (!isTodayColumn && status) {
            taskList.addEventListener('dragover', function(e) {
                e.preventDefault();
                taskList.classList.add('drag-over-column');
            });
            taskList.addEventListener('dragleave', function(e) {
                // taskList 자체를 벗어났을 때만 제거
                if (!taskList.contains(e.relatedTarget)) {
                    taskList.classList.remove('drag-over-column');
                }
            });
            taskList.addEventListener('drop', function(e) {
                e.preventDefault();
                taskList.classList.remove('drag-over-column');
                // 이미 topDropZone이나 task 위에서 처리되었으면 무시
                var target = e.target;
                if (target.closest('.column-drop-top') || target.closest('.task-node-self')) {
                    return;
                }
                var ids = self.dragDrop.getIdsToMove();
                if (ids.length > 0) {
                    // 칼럼 빈 영역 = 맨 아래에 추가
                    var siblings = self.ds.getRawTasks().filter(function(t) {
                        return t.ParentId == null && t.Status === status;
                    });
                    self.ds.moveTasks(ids, status, null, siblings.length);
                }
                self.dragDrop.endDrag();
            });
        }

        var trees = this.ds.buildTree(filteredTasks);
        trees.forEach(function(task) {
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
        input.className = 'quick-add-input';
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

    _showChildQuickAdd(parent) {
        var self = this;
        var parentId = parent.Id;
        var nodeEl = document.querySelector('.task-node[data-task-id="' + parentId + '"]');
        if (!nodeEl) return;

        var childrenContainer = nodeEl.querySelector('.task-node-children');
        if (!childrenContainer) {
            childrenContainer = document.createElement('div');
            childrenContainer.className = 'task-node-children';
            nodeEl.appendChild(childrenContainer);
        }

        var container = document.createElement('div');
        container.className = 'quick-add-container';

        var input = document.createElement('input');
        input.type = 'text';
        input.className = 'quick-add-input';
        input.placeholder = 'New subtask...';
        container.appendChild(input);
        childrenContainer.appendChild(container);
        input.focus();

        if (!parent.IsExpanded) {
            this.ds.updateExpandState(parentId, true);
        }

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

    _handleTaskClick(task, e) {
        if (e.ctrlKey || e.metaKey) {
            if (this.selectedIds.has(task.Id)) {
                this.selectedIds.delete(task.Id);
            } else {
                this.selectedIds.add(task.Id);
            }
            this.isMultiSelectMode = this.selectedIds.size > 0;
        } else if (e.shiftKey && this.lastClickedId !== null) {
            var list = this.renderedTasks;
            var startIdx = list.findIndex(function(t) { return t.Id === this.lastClickedId; }.bind(this));
            var endIdx = list.findIndex(function(t) { return t.Id === task.Id; });
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
        this.modal.open(task.Id, function() {
            self.render();
        });
    }

    _deleteTask(task) {
        var self = this;
        var snapshot = task.clone();
        var children = this.ds.getRawTasks().filter(function(t) { return t.ParentId === task.Id; }).map(function(t) { return t.clone(); });
        this.ds.deleteTask(task.Id);
        this.undo.push({
            desc: 'Deleted "' + task.Title + '"',
            undo: function() {
                self.ds.restoreTasks([snapshot].concat(children));
            }
        });
    }

    // ★ _handleDrop: position 문자열을 dataService._resolveDropLocation이 처리 ★
    _handleDrop(targetId, position) {
        var movingIds = this.dragDrop.getIdsToMove();
        if (movingIds.length === 0) return;

        var targetTask = this.ds.getById(targetId);
        if (!targetTask) return;

        // dataService.moveTasks가 _resolveDropLocation을 통해
        // targetId를 기준으로 Above/Below/Inside를 올바르게 해석
        this.ds.moveTasks(movingIds, targetTask.Status, targetId, position);
        this.dragDrop.endDrag();
    }

    _renderBulkBar() {
        if (this.selectedIds.size < 2) return null;

        var self = this;
        var bar = document.createElement('div');
        bar.className = 'bulk-action-bar';
        bar.innerHTML =
            '<span>' + this.selectedIds.size + ' tasks selected</span>' +
            '<button class="btn-modern" id="bulk-edit-btn">✏️ Bulk Edit</button>' +
            '<button class="btn-modern" id="bulk-delete-btn">🗑️ Delete</button>' +
            '<button class="btn-modern" id="bulk-cancel-btn">✖ Cancel</button>';

        bar.querySelector('#bulk-edit-btn').addEventListener('click', function() {
            self.bulkPanel.show(
                self.selectedIds,
                function(model) {
                    var snapshots = [];
                    model.taskIds.forEach(function(id) {
                        var t = self.ds.getById(id);
                        if (t) snapshots.push(t.clone());
                    });
                    self.ds.bulkUpdate(model);
                    self.undo.push({
                        desc: 'Bulk edited ' + model.taskIds.length + ' tasks',
                        undo: function() { self.ds.restoreTasks(snapshots); }
                    });
                    self.selectedIds.clear();
                    self.render();
                },
                function() { }
            );
        });

        bar.querySelector('#bulk-delete-btn').addEventListener('click', function() {
            if (confirm(self.selectedIds.size + '개 작업을 삭제하시겠습니까?')) {
                var ids = Array.from(self.selectedIds);
                var snapshots = ids.map(function(id) { return self.ds.getById(id); }).filter(Boolean).map(function(t) { return t.clone(); });
                self.ds.deleteTasks(ids);
                self.undo.push({
                    desc: 'Deleted ' + ids.length + ' tasks',
                    undo: function() { self.ds.restoreTasks(snapshots); }
                });
                self.selectedIds.clear();
                self.render();
            }
        });

        bar.querySelector('#bulk-cancel-btn').addEventListener('click', function() {
            self.selectedIds.clear();
            self.isMultiSelectMode = false;
            self.render();
        });

        return bar;
    }

    _buildRenderedList() {
        var all = [];
        var self = this;
        TaskStatusList.forEach(function(status) {
            var tasks = self.ds.getTasksForStatus(status);
            var filtered = self._filterTasks(tasks);
            var trees = self.ds.buildTree(filtered);
            var flatten = function(list) {
                list.forEach(function(t) {
                    all.push(t);
                    if (t.Children && t.Children.length > 0 && t.IsExpanded) {
                        flatten(t.Children);
                    }
                });
            };
            flatten(trees);
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

    _importData(e) {
        var self = this;
        var file = e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function(evt) {
            try {
                var result = self.ds.importFromJson(evt.target.result);
                if (result && result.success) {
                    self.toast.success('Imported ' + result.count + ' tasks');
                    self.render();
                }
            } catch (err) {
                self.toast.error('Import failed: ' + err.message);
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    }
}
