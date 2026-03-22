class UndoService {
    constructor() {
        this._stack = [];
        this._capacity = 20;
        this._listeners = [];
        this._autoHideTimer = null;
    }

    onChange(fn) { this._listeners.push(fn); }
    _notify() { this._listeners.forEach(fn => fn()); }

    push(action) {
        this._stack.unshift(action);
        if (this._stack.length > this._capacity) this._stack.pop();
        this._notify();
        this._startAutoHide();
    }

    async undoLatest() {
        if (this._stack.length === 0) return false;
        const action = this._stack.shift();
        try {
            await action.undo();
            this._notify();
            return true;
        } catch (e) {
            console.error('[UNDO] Failed:', e);
            return false;
        }
    }

    getLatest() { return this._stack[0] || null; }
    canUndo() { return this._stack.length > 0; }

    _startAutoHide() {
        clearTimeout(this._autoHideTimer);
        this._autoHideTimer = setTimeout(() => {
            // Just notify to potentially hide the snackbar
            this._notify();
        }, 10000);
    }
}