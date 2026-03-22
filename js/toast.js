class ToastService {
    constructor(containerId = 'toast-container') {
        this._container = document.getElementById(containerId);
    }

    show(message, type = 'info', duration = 3000) {
        const el = document.createElement('div');
        el.className = `toast ${type}`;
        el.textContent = message;
        this._container.appendChild(el);
        setTimeout(() => {
            el.style.opacity = '0';
            el.style.transition = 'opacity 0.3s';
            setTimeout(() => el.remove(), 300);
        }, duration);
    }

    success(msg) { this.show(msg, 'success'); }
    error(msg) { this.show(msg, 'error', 5000); }
    info(msg) { this.show(msg, 'info'); }
}