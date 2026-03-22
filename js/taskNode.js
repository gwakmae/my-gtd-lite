class TaskNodeRenderer {
    constructor(dataService, callbacks) {
        this.ds = dataService;
        this.cb = callbacks;
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
        selfEl.draggable = true;

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

        // Drag events
        selfEl.addEventListener('dragstart', function(e) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(task.Id));
            self.cb.onDragStart(task.Id, selfEl);
        });
        selfEl.addEventListener('dragend', function() {
            self.cb.onDragEnd();
        });
        selfEl.addEventListener('dragover', function(e) {
            e.preventDefault();
            e.stopPropagation();
            self._handleDragOver(selfEl, task, e);
        });
        selfEl.addEventListener('dragleave', function() {
            selfEl.classList.remove('drop-above', 'drop-inside', 'drop-below', 'drop-invalid');
        });
        selfEl.addEventListener('drop', function(e) {
            e.preventDefault();
            e.stopPropagation();
            self._handleDrop(selfEl, task);
        });

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

    _handleDragOver(selfEl, task, e) {
        var draggedId = this.cb.getDraggedId();
        if (!draggedId || draggedId === task.Id) {
            selfEl.classList.add('drop-invalid');
            return;
        }
        if (this._isDescendant(task.Id, draggedId)) {
            selfEl.classList.add('drop-invalid');
            return;
        }

        selfEl.classList.remove('drop-above', 'drop-inside', 'drop-below', 'drop-invalid');

        var rect = selfEl.getBoundingClientRect();
        var offsetY = e.clientY - rect.top;
        var height = rect.height;

        // 모바일 친화적 비율: 위 40% = 형제(위), 가운데 20% = 자식, 아래 40% = 형제(아래)
        if (offsetY < height * 0.4) {
            selfEl.classList.add('drop-above');
        } else if (offsetY > height * 0.6) {
            selfEl.classList.add('drop-below');
        } else {
            selfEl.classList.add('drop-inside');
        }
    }

    _handleDrop(selfEl, targetTask) {
        var position = 'Inside';
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
