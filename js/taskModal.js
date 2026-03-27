class TaskModal {
    constructor(dataService) {
        this.ds = dataService;
        this._onSave = null;
        this._backdropEl = null;
        this._mouseDownInsideModal = false;
    }

    open(taskId, onSave) {
        const task = this.ds.getById(taskId);
        if (!task) return;

        this._onSave = onSave;
        const local = task.clone();
        local.Contexts = [...(task.Contexts || [])];

        this._backdropEl = document.createElement('div');
        this._backdropEl.className = 'modal-backdrop';

        const container = document.createElement('div');
        container.className = 'modal-container';

        // Header
        const header = document.createElement('div');
        header.className = 'modal-header';
        header.innerHTML = `<h3>Edit Task Details</h3>`;
        const closeBtn = document.createElement('button');
        closeBtn.className = 'modal-close-btn';
        closeBtn.innerHTML = '×';
        closeBtn.addEventListener('click', () => this.close());
        header.appendChild(closeBtn);
        container.appendChild(header);

        // Body
        const body = document.createElement('div');
        body.className = 'modal-body';

        body.appendChild(this._formGroup('Title',
            `<input type="text" id="modal-title" value="${this._esc(local.Title)}" />`));

        body.appendChild(this._formGroup('Description',
            `<textarea id="modal-desc" rows="4">${this._esc(local.Description)}</textarea>`));

        body.appendChild(this._formGroup('Priority',
            `<select id="modal-priority">
                ${PriorityList.map(p => `<option value="${p}" ${p === local.Priority ? 'selected' : ''}>${p}</option>`).join('')}
            </select>`));

        const dateHtml = `<div class="date-group">
            <div class="form-group">
                <label for="modal-start">Start Date</label>
                <input type="date" id="modal-start" value="${local.StartDate ? local.StartDate.substring(0, 10) : ''}" />
            </div>
            <div class="form-group">
                <label for="modal-due">Due Date</label>
                <input type="date" id="modal-due" value="${local.DueDate ? local.DueDate.substring(0, 10) : ''}" />
            </div>
        </div>`;
        const dateEl = document.createElement('div');
        dateEl.innerHTML = dateHtml;
        body.appendChild(dateEl);

        // Contexts
        const ctxGroup = document.createElement('div');
        ctxGroup.className = 'form-group';
        ctxGroup.innerHTML = `<label>Contexts</label>`;

        const allContexts = this.ds.getAllContexts();
        const ctxTags = document.createElement('div');
        ctxTags.className = 'context-tags';
        for (const ctx of allContexts) {
            const tag = document.createElement('button');
            tag.type = 'button';
            tag.className = `context-tag ${local.Contexts.includes(ctx) ? 'selected' : ''}`;
            tag.innerHTML = `${ctx} <span>${local.Contexts.includes(ctx) ? '✔' : '○'}</span>`;
            tag.addEventListener('click', () => {
                const idx = local.Contexts.indexOf(ctx);
                if (idx >= 0) local.Contexts.splice(idx, 1);
                else local.Contexts.push(ctx);
                tag.className = `context-tag ${local.Contexts.includes(ctx) ? 'selected' : ''}`;
                tag.innerHTML = `${ctx} <span>${local.Contexts.includes(ctx) ? '✔' : '○'}</span>`;
                this._updateSelectedContexts(body, local);
            });
            ctxTags.appendChild(tag);
        }
        ctxGroup.appendChild(ctxTags);

        // New context input
        const newCtxDiv = document.createElement('div');
        newCtxDiv.className = 'new-context-input';
        newCtxDiv.innerHTML = `
            <input type="text" id="modal-new-ctx" placeholder="Add new (e.g. @Work)" />
            <button type="button" class="btn-add-context" id="modal-add-ctx-btn">
                ＋ Add
            </button>`;
        ctxGroup.appendChild(newCtxDiv);

        const selCtx = document.createElement('div');
        selCtx.className = 'selected-contexts';
        selCtx.id = 'modal-selected-ctx';
        ctxGroup.appendChild(selCtx);

        body.appendChild(ctxGroup);

        // Hidden checkbox
        const hiddenCheck = document.createElement('div');
        hiddenCheck.className = 'form-check';
        hiddenCheck.innerHTML = `
            <input type="checkbox" class="form-check-input" id="modal-hidden" ${local.IsHidden ? 'checked' : ''} />
            <label class="form-check-label" for="modal-hidden">Hide task and all sub-tasks</label>`;
        body.appendChild(hiddenCheck);

        container.appendChild(body);

        // Footer
        const footer = document.createElement('div');
        footer.className = 'modal-footer';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn btn-secondary';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', () => this.close());
        footer.appendChild(cancelBtn);

        const saveBtn = document.createElement('button');
        saveBtn.className = 'btn btn-primary';
        saveBtn.textContent = 'Save Changes';
        saveBtn.addEventListener('click', () => {
            this._doSave(local, body);
        });
        footer.appendChild(saveBtn);

        container.appendChild(footer);
        this._backdropEl.appendChild(container);

        // ★ 모달 드래그 보호: mousedown이 모달 내부에서 시작되었는지 추적 ★
        this._mouseDownInsideModal = false;

        container.addEventListener('mousedown', () => {
            this._mouseDownInsideModal = true;
        });

        document.addEventListener('mouseup', this._onGlobalMouseUp = () => {
            // mouseup 후 다음 tick에서 리셋 (click 이벤트가 먼저 처리되도록)
            setTimeout(() => {
                this._mouseDownInsideModal = false;
            }, 0);
        });

        this._backdropEl.addEventListener('click', (e) => {
            // 바깥 클릭으로 닫기: backdrop 자체를 클릭했고, 데스크탑이며, 
            // mousedown이 모달 내부에서 시작되지 않은 경우에만 닫기
            if (e.target === this._backdropEl && window.innerWidth >= 768 && !this._mouseDownInsideModal) {
                this.close();
            }
        });

        document.body.appendChild(this._backdropEl);
        document.body.style.overflow = 'hidden';

        // ★ Ctrl+Enter로 Save Changes ★
        this._onKeyDown = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                this._doSave(local, body);
            }
        };
        this._backdropEl.addEventListener('keydown', this._onKeyDown);

        setTimeout(() => {
            const addCtxBtn = document.getElementById('modal-add-ctx-btn');
            const newCtxInput = document.getElementById('modal-new-ctx');
            if (addCtxBtn && newCtxInput) {
                addCtxBtn.addEventListener('click', () => {
                    let val = newCtxInput.value.trim();
                    if (!val) return;
                    if (!val.startsWith('@')) val = '@' + val;
                    if (!local.Contexts.includes(val)) {
                        local.Contexts.push(val);
                    }
                    newCtxInput.value = '';
                    this._updateSelectedContexts(body, local);
                });
                newCtxInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        addCtxBtn.click();
                    }
                });
            }
            this._updateSelectedContexts(body, local);
            document.getElementById('modal-title')?.focus();
        }, 50);
    }

    _doSave(local, body) {
        local.Title = document.getElementById('modal-title')?.value || local.Title;
        local.Description = document.getElementById('modal-desc')?.value || '';
        local.Priority = document.getElementById('modal-priority')?.value || local.Priority;
        local.StartDate = document.getElementById('modal-start')?.value || null;
        local.DueDate = document.getElementById('modal-due')?.value || null;
        local.IsHidden = document.getElementById('modal-hidden')?.checked || false;

        this.ds.updateTask(local);
        if (this._onSave) this._onSave(local);
        this.close();
    }

    _updateSelectedContexts(body, local) {
        const container = document.getElementById('modal-selected-ctx');
        if (!container) return;
        if (local.Contexts.length === 0) {
            container.innerHTML = '';
            return;
        }
        container.innerHTML = `<small style="color: var(--text-muted);">Selected:</small> ` +
            local.Contexts.map(c =>
                `<span class="selected-context-badge">${c}
                    <button type="button" class="remove-ctx" data-ctx="${c}">✕</button>
                </span>`
            ).join('');

        container.querySelectorAll('.remove-ctx').forEach(btn => {
            btn.addEventListener('click', () => {
                const ctx = btn.dataset.ctx;
                local.Contexts = local.Contexts.filter(c => c !== ctx);
                this._updateSelectedContexts(body, local);
            });
        });
    }

    close() {
        // ★ 이벤트 리스너 정리 ★
        if (this._onGlobalMouseUp) {
            document.removeEventListener('mouseup', this._onGlobalMouseUp);
            this._onGlobalMouseUp = null;
        }
        if (this._backdropEl) {
            this._backdropEl.remove();
            this._backdropEl = null;
        }
        document.body.style.overflow = '';
    }

    _formGroup(label, inputHtml) {
        const div = document.createElement('div');
        div.className = 'form-group';
        div.innerHTML = `<label>${label}</label>${inputHtml}`;
        return div;
    }

    _esc(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    }
}
