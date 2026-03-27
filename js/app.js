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
            var isTaskEl = e.target.closest('.task-node-self, .bulk-action-bar, .bulk-edit-panel, button, input, select, textarea, .modal-container, .modal-backdrop');
            if (!isTaskEl && this.currentRoute === 'board') {
                this.boardView.deselectAll();
            }
        }, true);

        // Firebase 로드 상태에 따라 분기
        if (window._firebase) {
            this._setupFirebaseAuth();
        } else {
            document.addEventListener('firebase-ready', () => {
                this._setupFirebaseAuth();
            });
            document.addEventListener('firebase-failed', () => {
                console.log('[App] Running in offline/localStorage mode');
                var badge = document.getElementById('offline-badge');
                if (badge) badge.style.display = 'block';
                var overlay = document.getElementById('login-overlay');
                if (overlay) overlay.style.display = 'none';
            });
        }

        this._renderSidebar();
        this._render();
    },

    // 카카오톡 등 인앱 브라우저 감지
    _isInAppBrowser() {
        var ua = navigator.userAgent || '';
        return /KAKAOTALK|NAVER|Line|Instagram|FB_IAB|FBAN|Twitter/i.test(ua);
    },

    _setupFirebaseAuth() {
        var fb = window._firebase;
        if (!fb) return;

        // 브라우저 닫아도 로그인 유지
        fb.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

        fb.auth.onAuthStateChanged(async (user) => {
            if (user) {
                var overlay = document.getElementById('login-overlay');
                if (overlay) overlay.style.display = 'none';
                var badge = document.getElementById('offline-badge');
                if (badge) badge.style.display = 'none';
                await this.ds.enableFirebase(user.uid);
                this._renderSidebar();
                this._render();
                this.toast.success((user.displayName || user.email) + ' 로그인됨');
            } else {
                this.ds.disableFirebase();
                var overlay = document.getElementById('login-overlay');
                if (overlay) overlay.style.display = 'flex';
            }
        });

        var loginBtn = document.getElementById('login-btn');
        if (loginBtn) {
            loginBtn.addEventListener('click', async () => {
                try {
                    if (this._isInAppBrowser()) {
                        await fb.auth.signInWithRedirect(fb.provider);
                    } else {
                        await fb.auth.signInWithPopup(fb.provider);
                    }
                } catch (e) {
                    console.error('[Auth] Login error:', e);
                    if (e.code === 'auth/popup-blocked' || e.code === 'auth/popup-closed-by-user') {
                        try {
                            await fb.auth.signInWithRedirect(fb.provider);
                        } catch (e2) {
                            this.toast.error('로그인 실패: ' + e2.message);
                        }
                    } else {
                        this.toast.error('로그인 실패: ' + e.message);
                    }
                }
            });
        }

        fb.auth.getRedirectResult().then(function(result) {
        }).catch((e) => {
            if (e.code && e.code !== 'auth/no-auth-event') {
                console.error('[Auth] Redirect error:', e);
                this.toast.error('로그인 실패: ' + e.message);
            }
        });
    },

    navigate(route, context) {
        this.currentRoute = route;
        this.currentContext = context || '';
        this._render();
        this._renderSidebar();
        var sidebar = document.getElementById('sidebar');
        var overlay = document.getElementById('sidebar-overlay');
        if (sidebar) sidebar.classList.remove('is-open');
        if (overlay) overlay.classList.remove('is-open');
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
        var nav = document.getElementById('sidebar-nav');
        if (!nav) return;

        var contexts = this.ds.getAllContexts();
        var fb = window._firebase;
        var isLoggedIn = fb && fb.auth && fb.auth.currentUser;

        var html = '<div class="nav-section-header">Views</div>';
        html += '<button class="nav-link ' + (this.currentRoute === 'board' ? 'active' : '') + '" data-route="board"><span class="nav-icon">▦</span> GTD Board</button>';
        html += '<button class="nav-link ' + (this.currentRoute === 'focus' ? 'active' : '') + '" data-route="focus"><span class="nav-icon">★</span> Focus</button>';
        html += '<button class="nav-link ' + (this.currentRoute === 'active' ? 'active' : '') + '" data-route="active"><span class="nav-icon">⚡</span> Active Tasks</button>';

        html += '<div class="nav-section-header">Contexts</div>';
        if (contexts.length > 0) {
            for (var i = 0; i < contexts.length; i++) {
                var ctx = contexts[i];
                var ctxName = ctx.replace('@', '');
                var isActive = this.currentRoute === 'context' && this.currentContext === ctxName;
                html += '<button class="nav-link ' + (isActive ? 'active' : '') + '" data-route="context" data-context="' + ctxName + '"><span class="nav-icon">🏷</span> ' + ctx + '</button>';
            }
        } else {
            html += '<span class="nav-link-text">No contexts yet.</span>';
        }

        html += '<div class="nav-section-header">Account</div>';
        if (isLoggedIn) {
            var user = fb.auth.currentUser;
            var name = user.displayName || user.email || 'User';
            html += '<span class="nav-link-text" style="color:rgba(255,255,255,0.6);font-size:0.8rem;">👤 ' + name + '</span>';
            html += '<button class="nav-link" id="nav-logout"><span class="nav-icon">🚪</span> 로그아웃</button>';
        } else if (fb) {
            html += '<button class="nav-link" id="nav-login"><span class="nav-icon">🔑</span> 로그인</button>';
        } else {
            html += '<span class="nav-link-text" style="color:rgba(255,255,255,0.5);font-size:0.75rem;">📴 오프라인 모드</span>';
        }

        nav.innerHTML = html;

        nav.querySelectorAll('[data-route]').forEach(function(btn) {
            btn.addEventListener('click', () => {
                app.navigate(btn.dataset.route, btn.dataset.context);
            });
        });

        var logoutBtn = document.getElementById('nav-logout');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                try {
                    await window._firebase.auth.signOut();
                    this.toast.info('로그아웃되었습니다.');
                } catch (e) {
                    this.toast.error('로그아웃 실패');
                }
            });
        }

        var navLoginBtn = document.getElementById('nav-login');
        if (navLoginBtn) {
            navLoginBtn.addEventListener('click', () => {
                var overlay = document.getElementById('login-overlay');
                if (overlay) overlay.style.display = 'flex';
            });
        }
    },

    _setupSidebar() {
        var toggle = document.getElementById('sidebar-toggle');
        var closeBtn = document.getElementById('sidebar-close');
        var sidebar = document.getElementById('sidebar');
        var overlay = document.getElementById('sidebar-overlay');

        if (toggle) {
            toggle.addEventListener('click', () => {
                sidebar.classList.toggle('is-open');
                overlay.classList.toggle('is-open');
            });
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                sidebar.classList.remove('is-open');
                overlay.classList.remove('is-open');
            });
        }

        if (overlay) {
            overlay.addEventListener('click', () => {
                sidebar.classList.remove('is-open');
                overlay.classList.remove('is-open');
            });
        }
    },

    _handleKeyDown(e) {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
        if (document.querySelector('.modal-backdrop')) {
            if (e.key === 'Escape') {
                var modal = document.querySelector('.modal-backdrop');
                if (modal) modal.remove();
                document.body.style.overflow = '';
            }
            return;
        }

        if (e.key === 'Escape') {
            if (this.currentRoute === 'board') this.boardView.deselectAll();
        }

        // ★ Enter: 선택된 태스크가 1개일 때 형제 추가 모드 ★
        if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
            if (this.currentRoute === 'board' && this.boardView.selectedIds.size === 1) {
                var selectedId = Array.from(this.boardView.selectedIds)[0];
                var task = this.ds.getById(selectedId);
                if (task) {
                    e.preventDefault();
                    this.boardView._showSiblingQuickAdd(task);
                }
            }
        }

        if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
            if (this.currentRoute === 'board') {
                e.preventDefault();
                this.boardView.renderedTasks.forEach(function(t) {
                    app.boardView.selectedIds.add(t.Id);
                });
                this.boardView.render();
            }
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
            e.preventDefault();
            this.undo.undoLatest();
        }
    },

    _updateUndoUI() {
        var snackbar = document.getElementById('undo-snackbar');
        var msgEl = document.getElementById('undo-message');
        var undoBtn = document.getElementById('undo-btn');
        var closeBtn = document.getElementById('undo-close-btn');

        if (!snackbar || !msgEl) return;

        var latest = this.undo.getLatest();
        if (latest) {
            msgEl.textContent = latest.description;
            snackbar.style.display = 'flex';

            if (undoBtn) {
                undoBtn.onclick = () => {
                    this.undo.undoLatest();
                    snackbar.style.display = 'none';
                };
            }
            if (closeBtn) {
                closeBtn.onclick = () => {
                    snackbar.style.display = 'none';
                };
            }

            clearTimeout(this._undoTimer);
            this._undoTimer = setTimeout(() => {
                if (snackbar) snackbar.style.display = 'none';
            }, 10000);
        } else {
            snackbar.style.display = 'none';
        }

        var headerUndoBtn = document.getElementById('btn-undo');
        if (headerUndoBtn) headerUndoBtn.disabled = !this.undo.canUndo();
    },

    _undoTimer: null
};

document.addEventListener('DOMContentLoaded', () => app.init());
