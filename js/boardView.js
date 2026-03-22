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
        this.nodeRenderer = new TaskNodeRenderer(dataService, {
            onTaskClick: (task, e) => this._handleTaskClick(task, e),
            onTaskDblClick: (task) => this._openModal(task),
            onToggleComplete: (task) => {
                this.ds.toggleComplete(task.Id);
            },
            onDelete: (task) => this._deleteTask(task),
            onAddChild: (task) => this._showChildQuickAdd(task),
            onDragStart: (taskId, el) => {
                this.dragDrop.setSelectedIds(this.selectedIds);
                this.dragDrop.startDrag(taskId, el);
            },
            onDragEnd: () => this.dragDrop.endDrag(),
            onDrop: (targetId, position) => this._handleDrop(targetId, position),
            onRefresh: () => this.render()
        });
    }

    render() {
        const container = document.getElementById('content-area');
        if (!container) return;
        container.innerHTML = '';

        const wrapper = document.createElement('div');
        wrapper.className = 'board-container';

        const header = this._renderHeader();
        wrapper.appendChild(header);

        const columnsRow = document.createElement('div');
        columnsRow.className = 'board-columns';

        // Today column
        const todayTasks = this.ds.getTodayTasks();
        const todayCol = this._renderColumn('오늘 할 일', todayTasks, null, true);
        todayCol.classList.add('today-column');
        columnsRow.appendChild(todayCol);

        // Status columns
        TaskStatusList.forEach(status => {
            const tasks = this.ds.getTasksForStatus(status);
            const col = this._renderColumn(status, tasks, status, false);
            columnsRow.appendChild(col);
        });

        wrapper.appendChild(columnsRow);

        // Bulk action bar
        const bulkBar = this._renderBulkBar();
        if (bulkBar) wrapper.appendChild(bulkBar);

        container.appendChild(wrapper);

        this.dragDrop.setSelectedIds(this.selectedIds);
        this.renderedTasks = this._buildRenderedList();
    }

    _renderHeader() {
        const header = document.createElement('div');
        header.className = 'board-header';

        const stats = document.createElement('div');
        stats.className = 'header-stats';

        const activeTasks = this.ds.getActiveTasks();
        const todayTasks = this.ds.getTodayTasks();
        const focusTasks = this.ds.getFocusTasks();

        stats.innerHTML = `
            <div class="stat-item">
                <span class="stat-label">Active</span>
                <span class="stat-value">${activeTasks.length}</span>
            </div>
            <span class="stat-separator">|</span>
            <div class="stat-item">
                <span class="stat-label">Today</span>
                <span class="stat-value">${todayTasks.length}</span>
            </div>
            <span class="stat-separator">|</span>
            <div class="stat-item">
                <span class="stat-label">Focus</span>
                <span class="stat-value">${focusTasks.length}</span>
            </div>
        `;

        const actions = document.createElement('div');
        actions.className = 'header-actions';
        actions.innerHTML = `
            <button class="btn-modern" id="btn-export" title="Export">📤 Export</button>
            <button class="btn-modern" id="btn-import" title="Import">📥 Import</button>
            <input type="file" id="import-file" accept=".json" style="display:none">
            <button class="btn-modern" id="btn-undo" title="Undo (Ctrl+Z)" disabled>↩️ Undo</button>
            <button class="btn-modern" id="btn-hide-completed">${this.hideCompleted ? '👁️ Show Completed' : '🙈 Hide Completed'}</button>
            <button class="btn-modern" id="btn-show-hidden" style="display:${this.showHidden ? 'inline-flex' : 'none'}">${this.showHidden ? '👻 Hide Hidden' : '👻 Show Hidden'}</button>
        `;

        header.appendChild(stats);
        header.appendChild(actions);

        this._wireHeaderEvents(actions);

        return header;
    }

    _wireHeaderEvents(actions) {
        const self = this;
        const exportBtn = actions.querySelector('#btn-export');
        const importBtn = actions.querySelector('#btn-import');
        const importFile = actions.querySelector('#import-file');
        const undoBtn = actions.querySelector('#btn-undo');
        const hideCompletedBtn = actions.querySelector('#btn-hide-completed');
        const showHiddenBtn = actions.querySelector('#btn-show-hidden');

        if (exportBtn) exportBtn.addEventListener('click', () => self._exportData());
        if (importBtn) importBtn.addEventListener('click', () => importFile.click());
        if (importFile) importFile.addEventListener('change', (e) => self._importData(e));
        if (undoBtn) {
            if (self.undo.canUndo) undoBtn.disabled = false;
            undoBtn.addEventListener('click', async () => {
                await self.undo.undoLatest();
                self.render();
            });
        }
        if (hideCompletedBtn) {
            hideCompletedBtn.addEventListener('click', () => {
                self.hideCompleted = !self.hideCompleted;
                localStorage.setItem('gtd-hide-completed', self.hideCompleted);
                self.render();
            });
        }
        if (showHiddenBtn) {
            showHiddenBtn.addEventListener('click', () => {
                self.showHidden = !self.showHidden;
                localStorage.setItem('gtd-show-hidden', self.showHidden);
                self.render();
            });
        }
    }

    _renderColumn(title, tasks, status, isTodayColumn) {
        const col = document.createElement('div');
        col.className = 'board-column';
        if (status) col.dataset.status = status;

        const colHeader = document.createElement('div');
        colHeader.className = 'column-header';

        const filteredTasks = this._filterTasks(tasks);

        const titleEl = document.createElement('h3');
        titleEl.textContent = title + ' (' + filteredTasks.length + ')';
        colHeader.appendChild(titleEl);

        if (status === TaskStatus.Completed) {
            const clearBtn = document.createElement('button');
            clearBtn.className = 'btn-clear-completed';
            clearBtn.textContent = '🗑️ Clear All';
            clearBtn.addEventListener('click', () => {
                if (confirm('완료된 모든 작업을 삭제하시겠습니까?')) {
                    const completedTasks = this.ds.getTasksForStatus(TaskStatus.Completed);
                    const snapshot = completedTasks.map(t => t.clone());
                    this.ds.deleteAllCompleted();
                    this.undo.push({
                        desc: `Deleted ${snapshot.length} completed tasks`,
                        undo: () => this.ds.restoreTasks(snapshot)
                    });
                }
            });
            colHeader.appendChild(clearBtn);
        }

        col.appendChild(colHeader);

        const taskList = document.createElement('div');
        taskList.className = 'task-list';

        if (!isTodayColumn) {
            taskList.addEventListener('dragover', (e) => {
                e.preventDefault();
                taskList.classList.add('drag-over-column');
            });
            taskList.addEventListener('dragleave', () => {
                taskList.classList.remove('drag-over-column');
            });
            taskList.addEventListener('drop', (e) => {
                e.preventDefault();
                taskList.classList.remove('drag-over-column');
                const draggedIds = this.dragDrop.getMovingIds();
                if (draggedIds.length > 0 && status) {
                    this.ds.moveTasks(draggedIds, status, null, 'Inside');
                }
                this.dragDrop.endDrag();
            });
        }

        const trees = this.ds.buildTree(filteredTasks);
        trees.forEach(task => {
            const node = this.nodeRenderer.render(task, {
                selectedIds: this.selectedIds,
                hideCompleted: this.hideCompleted,
                showHidden: this.showHidden
            });
            if (node) taskList.appendChild(node);
        });

        col.appendChild(taskList);

        if (status && status !== TaskStatus.Completed && !isTodayColumn) {
            const addBtn = document.createElement('button');
            addBtn.className = 'add-task-btn';
            addBtn.textContent = '+ Add Task';
            addBtn.addEventListener('click', () => this._showQuickAdd(col, status, addBtn));
            col.appendChild(addBtn);
        }

        return col;
    }

    _filterTasks(tasks) {
        return tasks.filter(t => {
            if (this.hideCompleted && t.IsCompleted) return false;
            if (!this.showHidden && t.IsHidden) return false;
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

        input.addEventListener('keydown', function (e) {
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

        input.addEventListener('blur', function () {
            setTimeout(function () {
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
        var parentEl = document.querySelector('[data-task-id="' + parentId + '"]');
        if (!parentEl) return;

        var childrenContainer = parentEl.querySelector('.task-node-children');
        if (!childrenContainer) {
            childrenContainer = document.createElement('div');
            childrenContainer.className = 'task-node-children';
            parentEl.appendChild(childrenContainer);
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

        input.addEventListener('keydown', function (e) {
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

        input.addEventListener('blur', function () {
            setTimeout(function () {
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
            const list = this.renderedTasks;
            const startIdx = list.findIndex(t => t.Id === this.lastClickedId);
            const endIdx = list.findIndex(t => t.Id === task.Id);
            if (startIdx !== -1 && endIdx !== -1) {
                const from = Math.min(startIdx, endIdx);
                const to = Math.max(startIdx, endIdx);
                for (let i = from; i <= to; i++) {
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
        this.modal.open(task.Id, () => {
            this.render();
        });
    }

    _deleteTask(task) {
        const snapshot = task.clone();
        const children = this.ds.getAllTasks().filter(t => t.ParentId === task.Id).map(t => t.clone());
        this.ds.deleteTask(task.Id);
        this.undo.push({
            desc: `Deleted "${task.Title}"`,
            undo: () => {
                this.ds.restoreTasks([snapshot, ...children]);
            }
        });
    }

    _handleDrop(targetId, position) {
        const movingIds = this.dragDrop.getMovingIds();
        if (movingIds.length === 0) return;

        const targetTask = this.ds.getById(targetId);
        if (!targetTask) return;

        const newStatus = targetTask.Status;
        this.ds.moveTasks(movingIds, newStatus, targetId, position);
        this.dragDrop.endDrag();
    }

    _renderBulkBar() {
        if (this.selectedIds.size < 2) return null;

        const bar = document.createElement('div');
        bar.className = 'bulk-action-bar';
        bar.innerHTML = `
            <span>${this.selectedIds.size} tasks selected</span>
            <button class="btn-modern" id="bulk-edit-btn">✏️ Bulk Edit</button>
            <button class="btn-modern" id="bulk-delete-btn">🗑️ Delete</button>
            <button class="btn-modern" id="bulk-cancel-btn">✖ Cancel</button>
        `;

        const self = this;

        bar.querySelector('#bulk-edit-btn').addEventListener('click', () => {
            this.bulkPanel.show(
                this.selectedIds,
                (model) => {
                    const snapshots = [];
                    model.taskIds.forEach(id => {
                        const t = self.ds.getById(id);
                        if (t) snapshots.push(t.clone());
                    });
                    self.ds.bulkUpdate(model);
                    self.undo.push({
                        desc: `Bulk edited ${model.taskIds.length} tasks`,
                        undo: () => self.ds.restoreTasks(snapshots)
                    });
                    self.selectedIds.clear();
                    self.render();
                },
                () => {}
            );
        });

        bar.querySelector('#bulk-delete-btn').addEventListener('click', () => {
            if (confirm(this.selectedIds.size + '개 작업을 삭제하시겠습니까?')) {
                const ids = Array.from(this.selectedIds);
                const snapshots = ids.map(id => this.ds.getById(id)).filter(Boolean).map(t => t.clone());
                this.ds.deleteTasks(ids);
                this.undo.push({
                    desc: `Deleted ${ids.length} tasks`,
                    undo: () => this.ds.restoreTasks(snapshots)
                });
                this.selectedIds.clear();
                this.render();
            }
        });

        bar.querySelector('#bulk-cancel-btn').addEventListener('click', () => {
            this.selectedIds.clear();
            this.isMultiSelectMode = false;
            this.render();
        });

        return bar;
    }

    _buildRenderedList() {
        const all = [];
        TaskStatusList.forEach(status => {
            const tasks = this.ds.getTasksForStatus(status);
            const filtered = this._filterTasks(tasks);
            const trees = this.ds.buildTree(filtered);
            const flatten = (list) => {
                list.forEach(t => {
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
            const json = this.ds.exportToJson();
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
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
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const result = this.ds.importFromJson(evt.target.result);
                if (result.success) {
                    this.toast.success('Imported ' + result.count + ' tasks');
                    this.render();
                } else {
                    this.toast.error('Import failed: ' + result.error);
                }
            } catch (err) {
                this.toast.error('Import failed: ' + err.message);
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    }
}
