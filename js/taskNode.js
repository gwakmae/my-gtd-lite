class TaskNodeRenderer {
    constructor(dataService, callbacks) {
        this.ds = dataService;
        this.cb = callbacks;
    }

    render(task, opts = {}) {
        const { hideCompleted, showHidden, selectedIds, isMultiSelectMode } = opts;
        if (hideCompleted && task.IsCompleted) return null;
        if (!showHidden && task.IsHidden) return null;

        const nodeEl = document.createElement('div');
        nodeEl.className = 'task-node';
        nodeEl.dataset.taskId = task.Id;

        const selfEl = document.createElement('div');
        selfEl.className = 'task-node-self';
        selfEl.dataset.taskId = task.Id;
        selfEl.draggable = true;

        if (selectedIds && selectedIds.has(task.Id)) {
            if (isMultiSelectMode || selectedIds.size > 1) {
                selfEl.classList.add('is-multiselected');
            } else {
                selfEl.classList.add('is-selected');
            }
        }

        // Expander
        if (task.Children.length > 0) {
            const exp = document.createElement('span');
            exp.className = 'expander';
            exp.textContent = task.IsExpanded ? '▼' : '▶';
            exp.addEventListener('click', (e) => {
                e.stopPropagation();
                task.IsExpanded = !task.IsExpanded;
                this.ds.updateExpandState(task.Id, task.IsExpanded);
                this.cb.onRefresh();
            });
            selfEl.appendChild(exp);
        } else {
            const ph = document.createElement('span');
            ph.className = 'expander-placeholder';
            selfEl.appendChild(ph);
        }

        // Task Card Content
        const card = document.createElement('div');
        card.className = 'task-card-content';
        if (task.IsCompleted) card.classList.add('is-completed');

        if (!task.IsCompleted && task.DueDate) {
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const due = new Date(task.DueDate); due.setHours(0, 0, 0, 0);
            if (due < today) card.classList.add('is-overdue');
            else if (due.getTime() === today.getTime()) card.classList.add('is-due-today');
        }

        // Checkbox
        const checkBtn = document.createElement('button');
        checkBtn.className = 'task-checkbox-btn';
        checkBtn.type = 'button';
        const checkIcon = document.createElement('span');
        checkIcon.className = 'task-checkbox';
        checkIcon.textContent = task.IsCompleted ? '☑' : '☐';
        checkIcon.style.fontSize = '1.1rem';
        checkBtn.appendChild(checkIcon);
        checkBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.cb.onToggleComplete(task.Id);
        });
        card.appendChild(checkBtn);

        // Title
        const title = document.createElement('span');
        title.className = 'task-title';
        title.textContent = task.Title;
        card.appendChild(title);

        // Delete button
        const delBtn = document.createElement('button');
        delBtn.className = 'action-btn delete-btn';
        delBtn.innerHTML = '×';
        delBtn.title = 'Delete';
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.cb.onDelete(task.Id);
        });
        card.appendChild(delBtn);

        // Double click to edit
        card.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            e.preventDefault();
            this.cb.onDoubleClick(task.Id);
        });

        selfEl.appendChild(card);

        // Add child button
        const addBtn = document.createElement('button');
        addBtn.className = 'action-btn add-btn';
        addBtn.textContent = '+';
        addBtn.title = 'Add sub-task';
        addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.cb.onAddChild(task.Id, nodeEl);
        });
        selfEl.appendChild(addBtn);

        // Click handler
        selfEl.addEventListener('click', (e) => {
            this.cb.onTaskClick(task.Id, e);
        });

        // Drag events
        selfEl.addEventListener('dragstart', (e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(task.Id));
            this.cb.onDragStart(task.Id, selfEl);
        });
        selfEl.addEventListener('dragend', () => {
            this.cb.onDragEnd();
        });
        selfEl.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._handleDragOver(selfEl, task, e);
        });
        selfEl.addEventListener('dragleave', () => {
            selfEl.classList.remove('drop-above', 'drop-inside', 'drop-below', 'drop-invalid');
        });
        selfEl.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._handleDrop(selfEl, task);
        });

        nodeEl.appendChild(selfEl);

        // Children
        if (task.IsExpanded && task.Children.length > 0) {
            const childrenEl = document.createElement('div');
            childrenEl.className = 'task-node-children';

            const filteredChildren = task.Children
                .filter(c => !(hideCompleted && c.IsCompleted))
                .filter(c => showHidden || !c.IsHidden)
                .sort((a, b) => a.SortOrder - b.SortOrder);

            for (const child of filteredChildren) {
                const childNode = this.render(child, opts);
                if (childNode) childrenEl.appendChild(childNode);
            }
            nodeEl.appendChild(childrenEl);
        }

        return nodeEl;
    }

    _handleDragOver(selfEl, task, e) {
        const draggedId = this.cb.getDraggedId();
        if (!draggedId || draggedId === task.Id) {
            selfEl.classList.add('drop-invalid');
            return;
        }
        if (this._isDescendant(task.Id, draggedId)) {
            selfEl.classList.add('drop-invalid');
            return;
        }

        selfEl.classList.remove('drop-above', 'drop-inside', 'drop-below', 'drop-invalid');

        const rect = selfEl.getBoundingClientRect();
        const offsetY = e.clientY - rect.top;
        const zone = rect.height / 3;

        if (offsetY < zone) selfEl.classList.add('drop-above');
        else if (offsetY > rect.height - zone) selfEl.classList.add('drop-below');
        else selfEl.classList.add('drop-inside');
    }

    _handleDrop(selfEl, targetTask) {
        let position = 'Inside';
        if (selfEl.classList.contains('drop-above')) position = 'Above';
        else if (selfEl.classList.contains('drop-below')) position = 'Below';
        else if (selfEl.classList.contains('drop-invalid')) {
            selfEl.classList.remove('drop-above', 'drop-inside', 'drop-below', 'drop-invalid');
            return;
        }

        selfEl.classList.remove('drop-above', 'drop-inside', 'drop-below', 'drop-invalid');
        this.cb.onDrop(targetTask.Id, position);
    }

    _isDescendant(checkId, rootId) {
        const task = this.ds.getById(rootId);
        if (!task) return false;
        const desc = [];
        const collect = (pid) => {
            this.ds.getRawTasks().filter(t => t.ParentId === pid).forEach(c => {
                desc.push(c.Id);
                collect(c.Id);
            });
        };
        collect(rootId);
        return desc.includes(checkId);
    }
}
