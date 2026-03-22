class ListView {
    constructor(dataService, undoService, toastService) {
        this.ds = dataService;
        this.undo = undoService;
        this.toast = toastService;
        this.modal = new TaskModal(dataService);
        this.dragDrop = new DragDropManager();

        this.selectedIds = new Set();
        this.hideCompleted = JSON.parse(localStorage.getItem('gtd-hideCompleted') || 'false');
        this.showHidden = JSON.parse(localStorage.getItem('gtd-showHidden') || 'false');

        this.nodeRenderer = new TaskNodeRenderer(dataService, {
            onTaskClick: (id) => { this.selectedIds.clear(); this.selectedIds.add(id); this.render(this._currentView, this._currentContext); },
            onDoubleClick: (id) => this.modal.open(id, () => { }),
            onToggleComplete: (id) => this.ds.toggleComplete(id),
            onDelete: (id) => {
                const snapshot = this.ds.deleteTask(id);
                this.undo.push({ description: '작업 삭제됨', undo: () => this.ds.restoreTasks(snapshot) });
            },
            onAddChild: () => { },
            onDragStart: (id, el) => this.dragDrop.startDrag(id, el),
            onDragEnd: () => this.dragDrop.endDrag(),
            onDrop: () => { },
            getDraggedId: () => this.dragDrop.getDraggedId(),
            onRefresh: () => this.render(this._currentView, this._currentContext),
        });

        this._currentView = '';
        this._currentContext = '';
    }

    render(viewType, contextName) {
        this._currentView = viewType;
        this._currentContext = contextName;

        const container = document.getElementById('content-area');
        if (!container) return;
        container.innerHTML = '';

        const home = document.createElement('div');
        home.className = 'home-container';

        let title = '';
        let tasks = [];

        switch (viewType) {
            case 'focus':
                title = 'Focus';
                tasks = this.ds.getFocusTasks();
                break;
            case 'active':
                title = 'Active Tasks';
                tasks = this.ds.getActiveTasks(this.showHidden);
                break;
            case 'context':
                title = `Context: @${contextName}`;
                tasks = this.ds.getTasksByContext(`@${contextName}`);
                break;
        }

        const header = document.createElement('div');
        header.className = 'main-header';
        header.innerHTML = `<h1>${title}</h1>`;

        const btnGroup = document.createElement('div');
        btnGroup.style.cssText = 'margin-left:auto; display:flex; gap:0.5rem;';

        const undoBtn = document.createElement('button');
        undoBtn.className = 'btn btn-outline-secondary btn-sm';
        undoBtn.innerHTML = '↶';
        undoBtn.title = '실행 취소';
        undoBtn.disabled = !this.undo.canUndo();
        undoBtn.addEventListener('click', () => this.undo.undoLatest());
        btnGroup.appendChild(undoBtn);

        const hideBtn = document.createElement('button');
        hideBtn.className = 'btn btn-outline-secondary btn-sm';
        hideBtn.innerHTML = `${this.hideCompleted ? '👁' : '🙈'} ${this.hideCompleted ? 'Show' : 'Hide'} Completed`;
        hideBtn.addEventListener('click', () => {
            this.hideCompleted = !this.hideCompleted;
            localStorage.setItem('gtd-hideCompleted', JSON.stringify(this.hideCompleted));
            this.render(viewType, contextName);
        });
        btnGroup.appendChild(hideBtn);

        const hiddenBtn = document.createElement('button');
        hiddenBtn.className = `btn btn-outline-secondary btn-sm ${this.showHidden ? 'active' : ''}`;
        hiddenBtn.innerHTML = `${this.showHidden ? '👁' : '🙈'} ${this.showHidden ? 'Showing Hidden' : 'Show Hidden'}`;
        hiddenBtn.addEventListener('click', () => {
            this.showHidden = !this.showHidden;
            localStorage.setItem('gtd-showHidden', JSON.stringify(this.showHidden));
            this.render(viewType, contextName);
        });
        btnGroup.appendChild(hiddenBtn);

        header.appendChild(btnGroup);
        home.appendChild(header);

        const listContainer = document.createElement('div');
        listContainer.className = 'list-view-container';

        let filtered = tasks;
        if (this.hideCompleted) filtered = filtered.filter(t => !t.IsCompleted);
        if (!this.showHidden) filtered = filtered.filter(t => !t.IsHidden);

        if (filtered.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'empty-view-message';
            const emptyTexts = {
                focus: '집중할 작업이 없습니다. 멋진 하루 보내세요! ✨',
                active: '활성화된 작업이 없습니다. 👍',
                context: '이 컨텍스트에 해당하는 작업이 없습니다.'
            };
            emptyMsg.innerHTML = `<span style="font-size:3rem;opacity:0.4;">📋</span><span>${emptyTexts[viewType] || ''}</span>`;
            listContainer.appendChild(emptyMsg);
        } else {
            for (const task of filtered) {
                const node = this.nodeRenderer.render(task, {
                    hideCompleted: this.hideCompleted,
                    showHidden: this.showHidden,
                    selectedIds: this.selectedIds,
                    isMultiSelectMode: false,
                });
                if (node) listContainer.appendChild(node);
            }
        }

        home.appendChild(listContainer);
        container.appendChild(home);
    }
}
