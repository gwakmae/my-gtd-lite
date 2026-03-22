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
        const container = document.getElementById('content-area');
        if (!container) return;
        container.innerHTML = '';

        const home = document.createElement('div');
        home.className = 'home-container';

        home.appendChild(this._renderHeader());

        const board = document.createElement('div');
        board.className = 'board-container';

        const todayCol = this._renderColumn('Today', this.ds.getTodayTasks(), true);
        todayCol.classList.add('today-column');
        board.appendChild(todayCol);

        for (const status of TaskStatusList) {
            const tasks = this.ds.getTasksForStatus(status);
            const col = this._renderColumn(status, tasks, false, status);
            board.appendChild(col);
        }

        home.appendChild(board);
        home.appendChild(this._renderBulkBar());
        container.appendChild(home);

        this.dragDrop.setSelectedIds(this.selectedIds);
        this._buildRenderedList();
    }

    _renderHeader() {
        const header = document.createElement('div');
        header.className = 'main-header modern-header';

        const activeTasks = this.ds.getActiveTasks(this.showHidden);
        const todayTasks = this.ds.getTodayTasks();
        const focusTasks = this.ds.getFocusTasks();

        header.innerHTML = `
        <div class="header-content">
            <div class="header-left">
                <div class="app-logo">
                    <div class="logo-icon"><span style="font-size:20px;color:white;">▦</span></div>
                    <div class="logo-text">
                        <h1 class="app-title">GTD Board</h1>
                        <span class="app-subtitle">Getting Things Done</span>
                    </div>
                </div>
            </div>
            <div class="header-center">
                <div class="header-stats">
                    <a class="stat-item-link" data-nav="active">
                        <div class="stat-item">
                            <span class="stat-number">${activeTasks.length}</span>
                            <span class="stat-label">Active Tasks</span>
                        </div>
                    </a>
                    <div class="stat-divider"></div>
                    <div class="stat-item">
                        <span class="stat-number">${todayTasks.length}</span>
                        <span class="stat-label">Today</span>
                    </div>
                    <div class="stat-divider"></div>
                    <a class="stat-item-link" data-nav="focus">
                        <div class="stat-item">
                            <span class="stat-number">${focusTasks.length}</span>
                            <span class="stat-label">Focus</span>
                        </div>
                    </a>
                </div>
            </div>
            <div class="header-right">
                <div class="data-manager-btns">
                    <button class="btn-modern" id="btn-export" title="Export">
                        <span>↓</span><span class="btn-text">Export</span>
                    </button>
                    <button class="btn-modern" id="btn-import" title="Import">
                        <span>↑</span><span class="btn-text">Import</span>
                    </button>
                    <input type="file" id="file-import" accept=".json" class="file-input-hidden" />
                </div>
                <button class="btn-modern" id="btn-undo" title="실행 취소" ${this.undo.canUndo() ? '' : 'disabled'}>
                    <span>↶</span>
                </button>
                <button class="btn-modern" id="btn-hide-completed" title="${this.hideCompleted ? 'Show completed' : 'Hide completed'}">
                    <span>${this.hideCompleted ? '👁' : '🙈'}</span>
                    <span class="btn-text">${this.hideCompleted ? 'Show' : 'Hide'}</span>
                </button>
                <button class="btn-modern" id="btn-show-hidden" title="${this.showHidden ? 'Hide hidden' : 'Show hidden'}">
                    <span>${this.showHidden ? '👁' : '🙈'}</span>
                    <span class="btn-text">Hidden</span>
                </button>
            </div>
        </div>`;

        setTimeout(() => this._wireHeaderEvents(), 0);
        return header;
    }

    _wireHeaderEvents() {
        document.getElementById('btn-export')?.addEventListener('click', () => this._exportData());
        document.getElementById('btn-import')?.addEventListener('click', () => {
            document.getElementById('file-import')?.click();
        });
        document.getElementById('file-import')?.addEventListener('change', (e) => this._importData(e));
        document.getElementById('btn-undo')?.addEventListener('click', () => {
            this.undo.undoLatest();
        });
        document.getElementById('btn-hide-completed')?.addEventListener('click', () => {
            this.hideCompleted = !this.hideCompleted;
            localStorage.setItem('gtd-hideCompleted', JSON.stringify(this.hideCompleted));
            this.render();
        });
        document.getElementById('btn-show-hidden')?.addEventListener('click', () => {
            this.showHidden = !this.showHidden;
            localStorage.setItem('gtd-showHidden', JSON.stringify(this.showHidden));
            this.render();
        });
        document.querySelectorAll('[data-nav]').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                const nav = el.dataset.nav;
                if (window.app) window.app.navigate(nav);
            });
        });
    }

    _renderColumn(title, tasks, isTodayCol = false, status = null) {
        const col = document.createElement('div');
        col.className = 'board-column';
        if (status) col.dataset.status = status;

        if (status === TaskStatus.Completed) {
            const headerDiv = document.createElement('div');
            headerDiv.className = 'column-header-with-action';
            headerDiv.innerHTML = `<h3 class="column-header">${title}</h3>`;
            const clearBtn = document.createElement('button');
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
            const h = document.createElement('h3');
            h.className = 'column-header';
            h.textContent = title;
            col.appendChild(h);
        }

        const list = document.createElement('div');
        list.className = 'task-list';

        const filteredTasks = this._filterTasks(tasks);
        for (const task of filteredTasks) {
            const node = this.nodeRenderer.render(task, {
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
                const idsToMove = this.dragDrop.getIdsToMove();
                if (idsToMove.length > 0) {
                    const siblings = this.ds.getTasksForStatus(status);
                    this.ds.moveTasks(idsToMove, status, null, siblings.length);
                }
                this.dragDrop.endDrag();
            });

            if (!isTodayCol) {
                const addBtn = document.createElement('button');
                addBtn.className = 'add-task-btn';
                addBtn.textContent = '+ Add Task';
                addBtn.addEventListener('click', () => this._showQuickAdd(col, status));
                col.appendChild(addBtn);
            }
        }

        return col;
    }

    _filterTasks(tasks) {
        let result = tasks;
        if (this.hideCompleted) result = result.filter(t => !t.IsCompleted);
        if (!this.showHidden) result = result.filter(t => !t.IsHidden);
        return result;
    }

    _showQuickAdd(colEl, status) {
        colEl.querySelectorAll('.quick-add-container').forEach(e => e.remove());
        const addBtn = colEl.querySelector('.add-task-btn');
        if (addBtn) addBtn.style.display = 'none';

        const container = document.createElement('div');
        container.className = 'quick-add-container';
        const input = document.createElement('input');
        input.placeholder = 'Enter a title...';
        input.addEventListener('keyup', (e) => {
            if (e.key === 'Enter' && input.value.trim()) {
                this.ds.addTask(input.value.trim(), status, null);
                input.value = '';
                input.focus();
            } else if (e.key === 'Escape') {
                container.remove();
                if (addBtn) addBtn.style.display = '';
            }
        });
        input.addEventListener('blur', () => {
            if (input.value.trim()) {
                this.ds.addTask(input.value.trim(), status, null);
            }
            container.remove();
            if (addBtn) addBtn.style.display = '';
        });
        container.appendChild(input);
        colEl.appendChild(container);
        setTimeout(() => input.focus(), 50);
    }

    _showChildQuickAdd(parentId, nodeEl) {
        const parent = this.ds.getById(parentId);
        if (!parent) return;
        if (!parent.IsExpanded) {
            parent.IsExpanded = true;
            this.ds.updateExpandState(parentId, true);
            this.render();
            return;
        }

        let childrenEl = nodeEl.querySelector('.task-node-children');
        if (!childrenEl) {
            childrenEl = document.createElement('div');
            childrenEl.className = 'task-node-children';
            nodeEl.appendChild(childrenEl);
        }

        childrenEl.querySelectorAll('.quick-add-container').forEach(e => e.remove());

        const container = document.createElement('div');
        container.className = 'quick-add-container child-add';
        const input = document.createElement('input');
        input.placeholder = 'Add a sub-task...';
        input.addEventListener('keyup', (e) => {
            if (e.key === 'Enter' && input.value.trim()) {
                this.ds.addTask(input.value.trim(), parent.Status, parentId);
                input.value = '';
                input.focus();
            } else if (e.key === 'Escape') {
                container.remove();
            }
        });
        input.addEventListener('blur', () => {
            if (input.value.trim()) {
                this.ds.addTask(input.value.trim(), parent.Status, parentId);
            }
            container.remove();
        });
        container.appendChild(input);
        childrenEl.appendChild(container);
        setTimeout(() => input.focus(), 50);
    }

    _handleTaskClick(taskId, e) {
        if (this.isMultiSelectMode || e.ctrlKey || e.metaKey || e.shiftKey) {
            if (e.shiftKey && this.lastClickedId != null) {
                const lastIdx = this.renderedTasks.findIndex(t => t.Id === this.lastClickedId);
                const curIdx = this.renderedTasks.findIndex(t => t.Id === taskId);
                if (lastIdx !== -1 && curIdx !== -1) {
                    const start = Math.min(lastIdx, curIdx);
                    const end = Math.max(lastIdx, curIdx);
                    if (!e.ctrlKey && !e.metaKey) this.selectedIds.clear();
                    for (let i = start; i <= end; i++) {
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
        this.modal.open(taskId, () => { });
    }

    _deleteTask(id) {
        const snapshot = this.ds.deleteTask(id);
        this.undo.push({
            description: '작업 삭제됨',
            undo: () => this.ds.restoreTasks(snapshot)
        });
    }

    _handleDrop(targetTaskId, position) {
        const idsToMove = this.dragDrop.getIdsToMove();
        if (idsToMove.length === 0) return;
        if (idsToMove.includes(targetTaskId)) return;

        const target = this.ds.getById(targetTaskId);
        if (!target) return;

        let parentId, sortOrder;
        switch (position) {
            case 'Inside':
                parentId = target.Id;
                sortOrder = this.ds.getRawTasks().filter(t => t.ParentId === target.Id).length;
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
        const bar = document.createElement('div');
        bar.className = `bulk-action-bar ${this.selectedIds.size > 1 || this.isMultiSelectMode ? 'visible' : ''}`;
        bar.innerHTML = `
        <div class="bar-content">
            <span class="selection-count">${this.selectedIds.size}개 선택됨</span>
            <div class="actions">
                <button id="bulk-edit-btn">✎ 일괄 편집</button>
                <button class="danger" id="bulk-delete-btn">🗑 삭제</button>
            </div>
        </div>
        <button class="close-btn" id="bulk-deselect">×</button>`;

        setTimeout(() => {
            document.getElementById('bulk-edit-btn')?.addEventListener('click', () => {
                this.bulkEdit.show(this.selectedIds, (model) => {
                    this.ds.bulkUpdate(model);
                }, () => this.bulkEdit.hide());
            });
            document.getElementById('bulk-delete-btn')?.addEventListener('click', () => {
                if (confirm(`${this.selectedIds.size}개의 항목을 삭제하시겠습니까?`)) {
                    const snapshot = this.ds.deleteTasks([...this.selectedIds]);
                    this.undo.push({
                        description: `${snapshot.length}개 작업 삭제됨`,
                        undo: () => this.ds.restoreTasks(snapshot)
                    });
                    this.selectedIds.clear();
                    this.isMultiSelectMode = false;
                }
            });
            document.getElementById('bulk-deselect')?.addEventListener('click', () => {
                this.selectedIds.clear();
                this.isMultiSelectMode = false;
                this.render();
            });
        }, 0);

        return bar;
    }

    _buildRenderedList() {
        this.renderedTasks = [];
        const tree = this.ds.getAllTasks();
        const todayTasks = this.ds.getTodayTasks();

        const flatten = (items) => {
            for (const t of items) {
                this.renderedTasks.push(t);
                if (t.IsExpanded && t.Children.length > 0) {
                    flatten(t.Children);
                }
            }
        };
        flatten(todayTasks);
        for (const status of TaskStatusList) {
            flatten(this.ds.getTasksForStatus(status));
        }
        const seen = new Set();
        this.renderedTasks = this.renderedTasks.filter(t => {
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
        const json = this.ds.exportToJson();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gtd-tasks-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.toast.success('데이터를 내보냈습니다.');
    }

    _importData(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                this.ds.importFromJson(evt.target.result);
                this.toast.success('데이터를 가져왔습니다.');
            } catch (err) {
                this.toast.error(`가져오기 실패: ${err.message}`);
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    }
}
