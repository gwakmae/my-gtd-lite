class BulkEditPanel {
    constructor() {
        this._el = null;
        this._onApply = null;
    }

    show(selectedIds, onApply, onClose) {
        this._onApply = onApply;
        if (this._el) this._el.remove();

        this._el = document.createElement('div');
        this._el.className = 'bulk-edit-panel';
        this._el.innerHTML = `
            <div class="panel-header">
                <h5 style="margin:0">${selectedIds.size}개 항목 일괄 편집</h5>
                <button type="button" class="modal-close-btn" id="bulk-close">×</button>
            </div>
            <div class="panel-body">
                <div class="edit-group">
                    <label>마감일 변경</label>
                    <input type="date" id="bulk-due" />
                </div>
                <div class="edit-group">
                    <label>중요도 변경</label>
                    <select id="bulk-priority">
                        <option value="">-- 선택 안 함 --</option>
                        ${PriorityList.map(p => `<option value="${p}">${p}</option>`).join('')}
                    </select>
                </div>
                <div class="edit-group">
                    <label>컨텍스트 추가</label>
                    <input type="text" id="bulk-ctx-add" placeholder="예: @FollowUp" />
                </div>
                <div class="edit-group">
                    <label>컨텍스트 제거</label>
                    <input type="text" id="bulk-ctx-remove" placeholder="예: @Waiting" />
                </div>
            </div>
            <div class="panel-footer">
                <button class="btn btn-primary btn-sm" id="bulk-apply">일괄 적용</button>
                <button class="btn btn-secondary btn-sm" id="bulk-cancel">취소</button>
            </div>`;

        document.body.appendChild(this._el);

        this._el.querySelector('#bulk-close').addEventListener('click', () => this.hide());
        this._el.querySelector('#bulk-cancel').addEventListener('click', () => this.hide());
        this._el.querySelector('#bulk-apply').addEventListener('click', () => {
            const model = {
                taskIds: [...selectedIds],
                dueDate: document.getElementById('bulk-due')?.value || null,
                priority: document.getElementById('bulk-priority')?.value || null,
                contextToAdd: document.getElementById('bulk-ctx-add')?.value || null,
                contextToRemove: document.getElementById('bulk-ctx-remove')?.value || null,
            };
            if (this._onApply) this._onApply(model);
            this.hide();
        });
    }

    hide() {
        if (this._el) { this._el.remove(); this._el = null; }
    }
}