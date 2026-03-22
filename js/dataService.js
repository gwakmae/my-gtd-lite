class DataService {
    constructor() {
        this._tasks = [];
        this._nextId = 1;
        this._listeners = [];
        this._storageKey = 'gtd-tasks-data';

        // Firebase state
        this._useFirebase = false;
        this._userId = null;
        this._unsubscribe = null; // Firestore listener
        this._syncStatus = document.getElementById('sync-status');
        this._offlineBadge = document.getElementById('offline-badge');
        this._isSyncing = false;
    }

    // ─── Events ───
    onChange(fn) { this._listeners.push(fn); }
    _notify() { this._listeners.forEach(fn => fn()); }

    // ─── Init ───
    init() {
        // Always load from localStorage first (fast start)
        this._loadFromLocalStorage();
    }

    // ─── Firebase Setup (called from app.js after auth) ───
    async enableFirebase(userId) {
        this._useFirebase = true;
        this._userId = userId;
        this._setSyncStatus('동기화 중...');

        const fb = window._firebase;
        const docRef = fb.doc(fb.db, 'users', userId, 'data', 'tasks');

        try {
            // Load from Firestore
            const snap = await fb.getDoc(docRef);
            if (snap.exists()) {
                const data = snap.data();
                const remoteTasks = (data.tasks || []).map(t => new TaskItem(t));

                if (remoteTasks.length > 0) {
                    // Merge: remote wins, but keep local-only tasks
                    this._tasks = remoteTasks;
                    this._recalcNextId();
                    this._saveToLocalStorage(); // cache locally
                    this._notify();
                    this._setSyncStatus('✓ 동기화 완료');
                } else if (this._tasks.length > 0) {
                    // Remote is empty, push local data up
                    await this._saveToFirestore();
                    this._setSyncStatus('✓ 업로드 완료');
                }
            } else {
                // No remote data, push local up
                if (this._tasks.length > 0) {
                    await this._saveToFirestore();
                    this._setSyncStatus('✓ 초기 업로드 완료');
                }
            }

            // Listen for real-time changes
            this._unsubscribe = fb.onSnapshot(docRef, (snap) => {
                if (this._isSyncing) return; // ignore our own writes
                if (snap.exists()) {
                    const data = snap.data();
                    const remoteTasks = (data.tasks || []).map(t => new TaskItem(t));
                    this._tasks = remoteTasks;
                    this._recalcNextId();
                    this._saveToLocalStorage();
                    this._notify();
                    this._setSyncStatus('✓ 실시간 동기화');
                }
            });

        } catch (e) {
            console.error('[Firebase] Load error:', e);
            this._setSyncStatus('⚠ 동기화 실패 (로컬 모드)');
            this._useFirebase = false;
        }
    }

    disableFirebase() {
        if (this._unsubscribe) {
            this._unsubscribe();
            this._unsubscribe = null;
        }
        this._useFirebase = false;
        this._userId = null;
        this._setSyncStatus('');
    }

    _setSyncStatus(msg) {
        if (this._syncStatus) this._syncStatus.textContent = msg;
        if (msg) {
            clearTimeout(this._syncClearTimer);
            this._syncClearTimer = setTimeout(() => {
                if (this._syncStatus) this._syncStatus.textContent = '';
            }, 5000);
        }
    }

    // ─── Load / Save ───
    _loadFromLocalStorage() {
        const saved = localStorage.getItem(this._storageKey);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                this._tasks = (parsed.tasks || parsed).map(t => new TaskItem(t));
            } catch (e) {
                console.error('Failed to parse saved data:', e);
                this._tasks = [];
            }
        }
        if (this._tasks.length === 0) {
            this._loadEmbeddedData();
        }
        this._recalcNextId();
    }

    _loadEmbeddedData() {
        const el = document.getElementById('embedded-sample');
        if (el) {
            try {
                const data = JSON.parse(el.textContent);
                this._tasks = (data.tasks || data).map(t => new TaskItem(t));
                return;
            } catch (e) { console.error('Embedded data parse error:', e); }
        }
        this._loadFallbackData();
    }

    _loadFallbackData() {
        this._tasks = [
            new TaskItem({ Id: 1, Title: '새로운 아이디어 정리', Status: TaskStatus.Inbox, Priority: Priority.High, SortOrder: 0 }),
            new TaskItem({ Id: 2, Title: '장보기', Status: TaskStatus.NextActions, Priority: Priority.Low, SortOrder: 0, Contexts: ['@Market'] }),
            new TaskItem({ Id: 3, Title: '이메일 답장', Status: TaskStatus.NextActions, Priority: Priority.Medium, SortOrder: 1, Contexts: ['@Office'] }),
            new TaskItem({ Id: 4, Title: 'GTD 앱 개발', Status: TaskStatus.Projects, Priority: Priority.High, SortOrder: 0 }),
            new TaskItem({ Id: 5, Title: '여름 휴가 계획', Status: TaskStatus.Someday, Priority: Priority.Medium, SortOrder: 0 }),
            new TaskItem({ Id: 101, Title: 'UI 디자인', Status: TaskStatus.Projects, Priority: Priority.Medium, ParentId: 4, SortOrder: 0 }),
            new TaskItem({ Id: 102, Title: '백엔드 개발', Status: TaskStatus.Projects, Priority: Priority.Medium, ParentId: 4, SortOrder: 1 }),
        ];
        this._nextId = 200;
    }

    _recalcNextId() {
        if (this._tasks.length > 0) {
            this._nextId = Math.max(...this._tasks.map(t => t.Id)) + 1;
        }
    }

    save() {
        this._saveToLocalStorage();
        if (this._useFirebase) {
            this._saveToFirestore();
        }
    }

    _saveToLocalStorage() {
        const data = {
            tasks: this._tasks.map(t => {
                const plain = { ...t };
                delete plain.Children;
                return plain;
            })
        };
        localStorage.setItem(this._storageKey, JSON.stringify(data));
    }

    async _saveToFirestore() {
        if (!this._useFirebase || !this._userId) return;
        const fb = window._firebase;
        const docRef = fb.doc(fb.db, 'users', this._userId, 'data', 'tasks');
        const data = {
            tasks: this._tasks.map(t => {
                const plain = { ...t };
                delete plain.Children;
                return plain;
            }),
            updatedAt: new Date().toISOString()
        };
        try {
            this._isSyncing = true;
            await fb.setDoc(docRef, data);
            this._isSyncing = false;
            this._setSyncStatus('✓ 저장됨');
        } catch (e) {
            this._isSyncing = false;
            console.error('[Firebase] Save error:', e);
            this._setSyncStatus('⚠ 저장 실패');
        }
    }

    _saveAndNotify() { this.save(); this._notify(); }

    // ─── Tree Building ───
    buildTree() {
        const map = {};
        this._tasks.forEach(t => { t.Children = []; map[t.Id] = t; });
        const roots = [];
        this._tasks.forEach(t => {
            if (t.ParentId != null && map[t.ParentId]) {
                map[t.ParentId].Children.push(t);
            } else {
                roots.push(t);
            }
        });
        const sortRec = (items) => {
            items.sort((a, b) => a.SortOrder - b.SortOrder);
            items.forEach(i => sortRec(i.Children));
        };
        sortRec(roots);
        return roots;
    }

    // ─── Queries ───
    getAllTasks() { return this.buildTree(); }
    getRawTasks() { return this._tasks; }
    getById(id) { return this._tasks.find(t => t.Id === id) || null; }

    getTasksForStatus(status) {
        return this.buildTree().filter(t => t.Status === status);
    }

    getTodayTasks() {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        return this._tasks.filter(t =>
            !t.IsCompleted && t.StartDate && new Date(t.StartDate) <= today
        ).sort((a, b) => {
            const da = a.DueDate ? new Date(a.DueDate) : new Date(9999, 0);
            const db = b.DueDate ? new Date(b.DueDate) : new Date(9999, 0);
            return da - db;
        });
    }

    getFocusTasks() {
        const soon = new Date();
        soon.setDate(soon.getDate() + 3);
        soon.setHours(23, 59, 59);
        return this._tasks.filter(t =>
            !t.IsCompleted &&
            (t.Priority === Priority.High || (t.DueDate && new Date(t.DueDate) <= soon))
        ).sort((a, b) => {
            const da = a.DueDate ? new Date(a.DueDate) : new Date(9999, 0);
            const db = b.DueDate ? new Date(b.DueDate) : new Date(9999, 0);
            if (da - db !== 0) return da - db;
            return PriorityList.indexOf(b.Priority) - PriorityList.indexOf(a.Priority);
        });
    }

    getActiveTasks(showHidden) {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const tree = this.buildTree();
        const result = [];
        const walk = (items, parentHidden) => {
            for (const t of items) {
                const hidden = parentHidden || t.IsHidden;
                if (showHidden || !hidden) {
                    if (t.Status !== TaskStatus.Inbox &&
                        t.Children.length === 0 &&
                        !t.IsCompleted &&
                        (!t.StartDate || new Date(t.StartDate) <= today)) {
                        result.push(t);
                    }
                }
                walk(t.Children, hidden);
            }
        };
        walk(tree, false);
        return result;
    }

    getTasksByContext(context) {
        return this._tasks.filter(t =>
            !t.IsCompleted && t.Contexts.some(c => c.toLowerCase() === context.toLowerCase())
        ).sort((a, b) => {
            const si = TaskStatusList.indexOf(a.Status) - TaskStatusList.indexOf(b.Status);
            return si !== 0 ? si : a.SortOrder - b.SortOrder;
        });
    }

    getAllContexts() {
        const ctxSet = new Set();
        this._tasks.forEach(t => t.Contexts.forEach(c => ctxSet.add(c)));
        return [...ctxSet].sort();
    }

    // ─── Mutations ───
    addTask(title, status, parentId) {
        const siblings = this._tasks.filter(t => t.ParentId === parentId && t.Status === status);
        const maxSort = siblings.length > 0 ? Math.max(...siblings.map(s => s.SortOrder)) : -1;
        const task = new TaskItem({
            Id: this._nextId++,
            Title: title,
            Status: status,
            ParentId: parentId,
            SortOrder: maxSort + 1
        });
        this._tasks.push(task);
        this._saveAndNotify();
        return task;
    }

    updateTask(updated) {
        const idx = this._tasks.findIndex(t => t.Id === updated.Id);
        if (idx === -1) return;
        const old = this._tasks[idx];
        const hiddenChanged = old.IsHidden !== updated.IsHidden;

        const children = this._tasks[idx].Children;
        Object.assign(this._tasks[idx], updated);
        this._tasks[idx].Children = children || [];

        if (hiddenChanged) {
            this._cascadeHidden(updated.Id, updated.IsHidden);
        }
        this._saveAndNotify();
    }

    _cascadeHidden(parentId, isHidden) {
        const children = this._tasks.filter(t => t.ParentId === parentId);
        for (const c of children) {
            c.IsHidden = isHidden;
            this._cascadeHidden(c.Id, isHidden);
        }
    }

    deleteTask(id) {
        const snapshot = this._captureSubtree([id]);
        this._deleteRecursive(id);
        this._saveAndNotify();
        return snapshot;
    }

    deleteTasks(ids) {
        const snapshot = this._captureSubtree(ids);
        for (const id of ids) this._deleteRecursive(id);
        this._saveAndNotify();
        return snapshot;
    }

    _deleteRecursive(id) {
        const children = this._tasks.filter(t => t.ParentId === id);
        for (const c of children) this._deleteRecursive(c.Id);
        this._tasks = this._tasks.filter(t => t.Id !== id);
    }

    _captureSubtree(rootIds) {
        const result = [];
        const seen = new Set();
        const collect = (id) => {
            if (seen.has(id)) return;
            seen.add(id);
            const t = this._tasks.find(x => x.Id === id);
            if (t) {
                result.push(t.clone());
                this._tasks.filter(x => x.ParentId === id).forEach(c => collect(c.Id));
            }
        };
        rootIds.forEach(id => collect(id));
        return result;
    }

    restoreTasks(snapshot) {
        for (const t of snapshot) {
            this._tasks = this._tasks.filter(x => x.Id !== t.Id);
            this._tasks.push(new TaskItem(t));
        }
        this._nextId = Math.max(this._nextId, ...this._tasks.map(t => t.Id)) + 1;
        this._saveAndNotify();
    }

    toggleComplete(id) {
        const task = this.getById(id);
        if (!task) return;

        const completed = !task.IsCompleted;
        const seen = new Set();

        const updateRec = (t, isCompleted) => {
            if (seen.has(t.Id)) return;
            seen.add(t.Id);
            t.IsCompleted = isCompleted;
            if (isCompleted) {
                if (t.Status !== TaskStatus.Completed) t.OriginalStatus = t.Status;
                t.Status = TaskStatus.Completed;
            } else {
                t.Status = t.OriginalStatus || TaskStatus.NextActions;
                t.OriginalStatus = null;
            }
            this._tasks.filter(c => c.ParentId === t.Id).forEach(c => updateRec(c, isCompleted));
        };

        updateRec(task, completed);

        if (completed && task.ParentId != null) {
            let parent = this.getById(task.ParentId);
            while (parent && !parent.IsCompleted) {
                const siblings = this._tasks.filter(t => t.ParentId === parent.Id);
                if (siblings.every(s => s.IsCompleted)) {
                    updateRec(parent, true);
                    parent = parent.ParentId != null ? this.getById(parent.ParentId) : null;
                } else { break; }
            }
        }
        this._saveAndNotify();
    }

    moveTasks(taskIds, newStatus, newParentId, newSortOrder) {
        if (!Array.isArray(taskIds) || taskIds.length === 0) return;

        const selectedSet = new Set(taskIds);

        // 선택된 항목 중 "루트로 움직일 항목"만 추림
        const rootTasks = this._tasks
            .filter(t => selectedSet.has(t.Id) && (t.ParentId == null || !selectedSet.has(t.ParentId)))
            .sort((a, b) => a.SortOrder - b.SortOrder);

        if (rootTasks.length === 0) return;

        const movingRootIds = new Set(rootTasks.map(t => t.Id));

        // 현재 소속 그룹 기록 (이동 후 source 그룹 재정렬용)
        const sourceGroups = new Set(
            rootTasks.map(t => this._groupKey(t.ParentId, t.Status))
        );

        // 문자열 드롭 위치(Above/Below/Inside)를 실제 parentId/sortOrder로 변환
        const resolved = this._resolveDropLocation(rootTasks, newStatus, newParentId, newSortOrder);
        if (!resolved) return;

        newStatus = resolved.status;
        newParentId = resolved.parentId;
        newSortOrder = resolved.sortOrder;

        // 자기 자신/자기 자손 아래로 이동 금지
        if (newParentId != null) {
            const allDesc = this._getAllDescendantIds([...movingRootIds]);
            if (allDesc.has(newParentId) || movingRootIds.has(newParentId)) {
                return;
            }
        }

        // 루트 + 자손들의 status 업데이트
        const allAffectedIds = this._getAllDescendantIds([...movingRootIds]);
        for (const t of this._tasks) {
            if (allAffectedIds.has(t.Id)) {
                t.Status = newStatus;
            }
        }

        // 루트 태스크들의 부모 변경
        for (const rt of rootTasks) {
            rt.ParentId = newParentId;
        }

        // 1) source 그룹 재정렬
        for (const key of sourceGroups) {
            const group = this._parseGroupKey(key);

            if (group.parentId === newParentId && group.status === newStatus) {
                continue;
            }

            const remaining = this._tasks
                .filter(t =>
                    t.ParentId === group.parentId &&
                    t.Status === group.status &&
                    !movingRootIds.has(t.Id)
                )
                .sort((a, b) => a.SortOrder - b.SortOrder);

            remaining.forEach((t, i) => {
                t.SortOrder = i;
            });
        }

        // 2) destination 그룹에 정확한 위치로 삽입
        const destSiblings = this._tasks
            .filter(t =>
                t.ParentId === newParentId &&
                t.Status === newStatus &&
                !movingRootIds.has(t.Id)
            )
            .sort((a, b) => a.SortOrder - b.SortOrder);

        const insertIndex = Math.max(0, Math.min(Number(newSortOrder), destSiblings.length));
        destSiblings.splice(insertIndex, 0, ...rootTasks);

        destSiblings.forEach((t, i) => {
            t.SortOrder = i;
        });

        this._saveAndNotify();
    }

    _resolveDropLocation(rootTasks, status, parentIdOrTargetId, sortOrderOrPosition) {
        const movingRootIds = new Set(rootTasks.map(t => t.Id));

        // 기존 numeric 호출도 계속 지원
        if (typeof sortOrderOrPosition === 'number' && Number.isFinite(sortOrderOrPosition)) {
            return {
                status,
                parentId: parentIdOrTargetId,
                sortOrder: sortOrderOrPosition
            };
        }

        const position = sortOrderOrPosition;

        // 컬럼 빈 공간/컬럼 body 드롭
        if (position === 'Inside' && parentIdOrTargetId == null) {
            const siblings = this._tasks
                .filter(t =>
                    t.ParentId == null &&
                    t.Status === status &&
                    !movingRootIds.has(t.Id)
                )
                .sort((a, b) => a.SortOrder - b.SortOrder);

            return {
                status,
                parentId: null,
                sortOrder: siblings.length
            };
        }

        const targetTask = this.getById(parentIdOrTargetId);
        if (!targetTask) return null;

        // target 안으로 넣기 = target의 마지막 자식
        if (position === 'Inside') {
            const children = this._tasks
                .filter(t =>
                    t.ParentId === targetTask.Id &&
                    t.Status === targetTask.Status &&
                    !movingRootIds.has(t.Id)
                )
                .sort((a, b) => a.SortOrder - b.SortOrder);

            return {
                status: targetTask.Status,
                parentId: targetTask.Id,
                sortOrder: children.length
            };
        }

        // Above / Below = target의 형제 위치
        const actualParentId = targetTask.ParentId;
        const siblings = this._tasks
            .filter(t =>
                t.ParentId === actualParentId &&
                t.Status === targetTask.Status &&
                !movingRootIds.has(t.Id)
            )
            .sort((a, b) => a.SortOrder - b.SortOrder);

        const targetIndex = siblings.findIndex(t => t.Id === targetTask.Id);
        if (targetIndex === -1) return null;

        return {
            status: targetTask.Status,
            parentId: actualParentId,
            sortOrder: position === 'Above' ? targetIndex : targetIndex + 1
        };
    }

    _groupKey(parentId, status) {
        return `${parentId == null ? 'null' : parentId}::${status}`;
    }

    _parseGroupKey(key) {
        const [parentRaw, status] = key.split('::');
        return {
            parentId: parentRaw === 'null' ? null : Number(parentRaw),
            status
        };
    }

    _getAllDescendantIds(rootIds) {
        const result = new Set(rootIds);
        const queue = [...rootIds];
        while (queue.length > 0) {
            const pid = queue.shift();
            this._tasks.filter(t => t.ParentId === pid).forEach(c => {
                if (!result.has(c.Id)) {
                    result.add(c.Id);
                    queue.push(c.Id);
                }
            });
        }
        return result;
    }

    bulkUpdate(model) {
        const tasksToUpdate = this._tasks.filter(t => model.taskIds.includes(t.Id));
        for (const task of tasksToUpdate) {
            if (model.dueDate) task.DueDate = model.dueDate;
            if (model.priority) task.Priority = model.priority;
            if (model.contextToAdd) {
                const c = model.contextToAdd.startsWith('@') ? model.contextToAdd : `@${model.contextToAdd}`;
                if (!task.Contexts.includes(c)) task.Contexts.push(c);
            }
            if (model.contextToRemove) {
                const c = model.contextToRemove.startsWith('@') ? model.contextToRemove : `@${model.contextToRemove}`;
                task.Contexts = task.Contexts.filter(x => x !== c);
            }
        }
        this._saveAndNotify();
    }

    deleteAllCompleted() {
        const completedIds = this._tasks.filter(t => t.Status === TaskStatus.Completed).map(t => t.Id);
        for (const id of completedIds) this._deleteRecursive(id);
        this._saveAndNotify();
    }

    deleteContext(context) {
        this._tasks.forEach(t => {
            t.Contexts = t.Contexts.filter(c => c !== context);
        });
        this._saveAndNotify();
    }

    updateExpandState(taskId, isExpanded) {
        const t = this.getById(taskId);
        if (t) {
            t.IsExpanded = isExpanded;
            this.save();
        }
    }

    // ─── Import / Export ───
    exportToJson() {
        const data = {
            tasks: this._tasks.map(t => {
                const plain = { ...t };
                delete plain.Children;
                return plain;
            })
        };
        return JSON.stringify(data, null, 2);
    }

    importFromJson(jsonStr) {
        const data = JSON.parse(jsonStr);
        const tasks = data.tasks || data;
        if (!Array.isArray(tasks) || tasks.length === 0) {
            throw new Error('파일에 유효한 태스크 데이터가 없습니다.');
        }
        if (tasks.length > 1000) {
            throw new Error('태스크가 너무 많습니다 (최대 1000개).');
        }
        const idSet = new Set();
        for (const t of tasks) {
            if (idSet.has(t.Id)) throw new Error(`ID ${t.Id} 중복`);
            idSet.add(t.Id);
            if (!t.Title || t.Title.trim() === '') throw new Error(`ID ${t.Id}의 제목이 비어있습니다.`);
        }
        this._tasks = tasks.map(t => new TaskItem(t));
        this._nextId = Math.max(...this._tasks.map(t => t.Id)) + 1;
        this._saveAndNotify();
    }

    findInTree(tree, id) {
        for (const t of tree) {
            if (t.Id === id) return t;
            const found = this.findInTree(t.Children, id);
            if (found) return found;
        }
        return null;
    }
}
