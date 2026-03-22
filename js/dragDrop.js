class DragDropManager {
    constructor() {
        this._draggedId = null;
        this._draggedEl = null;
        this._selectedIds = new Set();
    }

    setSelectedIds(ids) { this._selectedIds = ids; }

    startDrag(taskId, element) {
        this._draggedId = taskId;
        this._draggedEl = element;
        if (element) element.classList.add('is-dragging-source');
    }

    endDrag() {
        if (this._draggedEl) {
            this._draggedEl.classList.remove('is-dragging-source');
        }
        this._draggedId = null;
        this._draggedEl = null;
        // Clean all drop indicators
        document.querySelectorAll('.drop-above, .drop-inside, .drop-below, .drop-invalid')
            .forEach(el => el.classList.remove('drop-above', 'drop-inside', 'drop-below', 'drop-invalid'));
    }

    getDraggedId() { return this._draggedId; }

    getIdsToMove() {
        if (!this._draggedId) return [];
        if (this._selectedIds.has(this._draggedId)) {
            return [...this._selectedIds];
        }
        return [this._draggedId];
    }
}