const app = {
ds: null,
    undo: null,
        toast: null,
            boardView: null,
                listView: null,
                    currentRoute: 'board',
                        currentContext: '',

                            init() {
    this.ds = new DataService();
    this.undo = new UndoService();
    this.toast = new ToastService();

    this.ds.init();

    this.boardView = new BoardView(this.ds, this.undo, this.toast);
    this.listView = new ListView(this.ds, this.undo, this.toast);

    this.ds.onChange(() => this._render());
    this.undo.onChange(() => this._updateUndoUI());

    this._setupSidebar();

    document.addEventListener('keydown', (e) => this._handleKeyDown(e));

    document.addEventListener('click', (e) => {
        const isTaskEl = e.target.closest('.task-node-self, .bulk-action-bar, .bulk-edit-panel, button, input, select, textarea, .modal-container, .modal-backdrop');
        if (!isTaskEl && this.currentRoute === 'board') {
            this.boardView.deselectAll();
        }
    }, true);

    // Firebase auth check
    this._setupFirebaseAuth();

    this._renderSidebar();
    this._render();
},

_setupFirebaseAuth() {
    const fb = window._firebase;
    if (!fb || !fb.ready) {
        // Firebase 미사용 — localStorage 모드
        document.getElementById('login-overlay')?.classList.add('hidden');
        document.getElementById('offline-badge')?.classList.add('visible');
        console.log('[App] Running in offline/localStorage mode');
        return;
    }

    // Firebase 사용 가능 — 인증 상태 감시
    fb.onAuthStateChanged(fb.auth, async (user) => {
        if (user) {
            // 로그인됨
            document.getElementById('login-overlay')?.classList.add('hidden');
            document.getElementById('offline-badge')?.classList.remove('visible');
            await this.ds.enableFirebase(user.uid);
            this._renderSidebar();
            this._render();
            this.toast.success(`${user.displayName || user.email}로 로그인됨`);
        } else {
            // 로그아웃 상태 — 로그인 화면 표시
            this.ds.disableFirebase();
            document.getElementById('login-overlay')?.classList.remove('hidden');
        }
    });

    // 로그인 버튼
    document.getElementById('login-google-btn')?.addEventListener('click', async () => {
        try {
            const provider = new fb.GoogleAuthProvider();
            await fb.signInWithPopup(fb.auth, provider);
        } catch (e) {
            console.error('[Auth] Login error:', e);
            this.toast.error('로그인 실패: ' + e.message);
        }
    });
},

navigate(route, context) {
    this.currentRoute = route;
    this.currentContext = context || '';
    this._render();
    this._renderSidebar();
    document.getElementById('sidebar')?.classList.remove('is-open');
    document.getElementById('sidebar-backdrop')?.classList.remove('is-open');
},

_render() {
    switch (this.currentRoute) {
        case 'board':
            this.boardView.render();
            break;
        case 'focus':
        case 'active':
            this.listView.render(this.currentRoute);
            break;
        case 'context':
            this.listView.render('context', this.currentContext);
            break;
    }
    this._updateUndoUI();
},

_renderSidebar() {
    const nav = document.getElementById('nav-menu');
    if (!nav) return;

    const contexts = this.ds.getAllContexts();
    const fb = window._firebase;
    const isLoggedIn = fb && fb.ready && fb.auth.currentUser;

    let html = `
        <nav>
            <div class="nav-section-header">Views</div>
            <button class="nav-link ${this.currentRoute === 'board' ? 'active' : ''}" data-route="board">
                <span class="nav-icon">▦</span> GTD Board
            </button>
            <button class="nav-link ${this.currentRoute === 'focus' ? 'active' : ''}" data-route="focus">
                <span class="nav-icon">★</span> Focus
            </button>
            <button class="nav-link ${this.currentRoute === 'active' ? 'active' : ''}" data-route="active">
                <span class="nav-icon">⚡</span> Active Tasks
            </button>

            <div class="nav-section-header">Contexts</div>`;

    if (contexts.length > 0) {
        for (const ctx of contexts) {
            const ctxName = ctx.replace('@', '');
            const isActive = this.currentRoute === 'context' && this.currentContext === ctxName;
            html += `<button class="nav-link ${isActive ? 'active' : ''}" data-route="context" data-context="${ctxName}">
                    <span class="nav-icon">🏷</span> ${ctx}
                </button>`;
        }
    } else {
        html += `<span class="nav-link-text">No contexts yet.</span>`;
    }

    // 로그인/로그아웃 버튼
    html += `<div class="nav-section-header">Account</div>`;
    if (isLoggedIn) {
        const user = fb.auth.currentUser;
        const name = user.displayName || user.email || 'User';
        html += `<span class="nav-link-text" style="color:rgba(255,255,255,0.6);font-style:normal;font-size:0.8rem;">👤 ${name}</span>`;
        html += `<button class="nav-link" id="nav-logout">
                <span class="nav-icon">🚪</span> 로그아웃
            </button>`;
    } else if (fb && fb.ready) {
        html += `<button class="nav-link" id="nav-login">
                <span class="nav-icon">🔑</span> 로그인
            </button>`;
    } else {
        html += `<span class="nav-link-text" style="color:rgba(255,255,255,0.5);font-size:0.75rem;">📴 오프라인 모드</span>`;
    }

    html += `</nav>`;
    nav.innerHTML = html;

    // Wire nav events
    nav.querySelectorAll('[data-route]').forEach(btn => {
        btn.addEventListener('click', () => {
            this.navigate(btn.dataset.route, btn.dataset.context);
        });
    });

    // Logout
    document.getElementById('nav-logout')?.addEventListener('click', async () => {
        try {
            await window._firebase.signOut(window._firebase.auth);
            this.toast.info('로그아웃되었습니다.');
        } catch (e) {
            this.toast.error('로그아웃 실패');
        }
    });

    // Login from sidebar
    document.getElementById('nav-login')?.addEventListener('click', () => {
        document.getElementById('login-overlay')?.classList.remove('hidden');
    });
},

_setupSidebar() {
    const hamburger = document.getElementById('hamburger-btn');
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');

    hamburger?.addEventListener('click', () => {
        sidebar.classList.toggle('is-open');
        backdrop.classList.toggle('is-open');
    });

    backdrop?.addEventListener('click', () => {
        sidebar.classList.remove('is-open');
        backdrop.classList.remove('is-open');
    });
},

_handleKeyDown(e) {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    if (document.querySelector('.modal-backdrop')) {
        if (e.key === 'Escape') {
            document.querySelector('.modal-backdrop')?.remove();
            document.body.style.overflow = '';
        }
        return;
    }

    if (e.key === 'Escape') {
        if (this.currentRoute === 'board') this.boardView.deselectAll();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        if (this.currentRoute === 'board') {
            e.preventDefault();
            this.boardView.renderedTasks.forEach(t => this.boardView.selectedIds.add(t.Id));
            this.boardView.render();
        }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        this.undo.undoLatest();
    }
},

_updateUndoUI() {
    const snackbar = document.getElementById('undo-snackbar');
    const msgEl = document.getElementById('undo-message');
    const undoBtn = document.getElementById('undo-btn');
    const closeBtn = document.getElementById('undo-close-btn');

    const latest = this.undo.getLatest();
    if (latest) {
        msgEl.textContent = latest.description;
        snackbar.style.display = 'flex';

        undoBtn.onclick = () => {
            this.undo.undoLatest();
            snackbar.style.display = 'none';
        };
        closeBtn.onclick = () => {
            snackbar.style.display = 'none';
        };

        clearTimeout(this._undoTimer);
        this._undoTimer = setTimeout(() => {
            snackbar.style.display = 'none';
        }, 10000);
    } else {
        snackbar.style.display = 'none';
    }

    const headerUndoBtn = document.getElementById('btn-undo');
    if (headerUndoBtn) headerUndoBtn.disabled = !this.undo.canUndo();
},

_undoTimer: null,
};

document.addEventListener('DOMContentLoaded', () => app.init());
