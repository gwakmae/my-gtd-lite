class DataService {
    constructor() {
        this._tasks = [];
        this._nextId = 1;
        this._listeners = [];
        this._storageKey = 'gtd-tasks-data';

        this._useFirebase = false;
        this._userId = null;
        this._unsubscribe = null;
        this._isSyncing = false;
    }

    onChange(fn) { this._listeners.push(fn); }
    _notify() { this._listeners.forEach(fn => fn()); }

    init() {
        this._loadFromLocalStorage();
    }

    // ─── Firebase (compat SDK) ───
    async enableFirebase(userId) {
        this._useFirebase = true;
        this._userId = userId;
        this._setSyncStatus('동기화 중...');

        var fb = window._firebase;
        if (!fb || !fb.db) {
            this._useFirebase = false;
            return;
        }

        var docRef = fb.db.collection('users').doc(userId).collection('data').doc('tasks');

        try {
            var snap = await docRef.get();
            if (snap.exists) {
                var data = snap.data();
                var remoteTasks = (data.tasks || []).map(function(t) { return new TaskItem(t); });

                if (remoteTasks.length > 0) {
                    this._tasks = remoteTasks;
                    this._recalcNextId();
                    this._saveToLocalStorage();
                    this._notify();
                    this._setSyncStatus('✓ 동기화 완료');
                } else if (this._tasks.length > 0) {
                    await this._saveToFirestore();
                    this._setSyncStatus('✓ 업로드 완료');
                }
            } else {
                if (this._tasks.length > 0) {
                    await this._saveToFirestore();
                    this._setSyncStatus('✓ 초기 업로드 완료');
                }
            }

            // 실시간 리스너
            this._unsubscribe = docRef.onSnapshot((snap) => {
                if (this._isSyncing) return;
                if (snap.exists) {
                    var data = snap.data();
                    var remoteTasks = (data.tasks || []).map(function(t) { return new TaskItem(t); });
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
        var el = document.getElementById('sync-status');
        if (el) {
            el.textContent = msg;
            if (msg) el.style.display = 'block';
        }
        if (msg) {
            clearTimeout(this._syncClearTimer);
            this._syncClearTimer = setTimeout(() => {
                if (el) { el.textContent = ''; el.style.display = 'none'; }
            }, 5000);
        }
    }

    // ─── Load / Save ───
    _loadFromLocalStorage() {
        var saved = localStorage.getItem(this._storageKey);
        if (saved) {
            try {
                var parsed = JSON.parse(saved);
                this._tasks = (parsed.tasks || parsed).map(function(t) { return new TaskItem(t); });
            } catch (e) {
                console.error('Failed to parse saved data:', e);
                this._tasks = [];
            }
        }
        if (this._tasks.length === 0) {
            this._loadFallbackData();
        }
        this._recalcNextId();
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
            this._nextId = Math.max(...this._tasks.map(function(t) { return t.Id; })) + 1;
        }
    }

    save() {
        this._saveToLocalStorage();
        if (this._useFirebase) {
            this._saveToFirestore();
        }
    }

    _saveToLocalStorage() {
        var data = {
            tasks: this._tasks.map(function(t) {
                var plain = Object.assign({}, t);
                delete plain.Children;
                return plain;
            })
        };
        localStorage.setItem(this._storageKey, JSON.stringify(data));
    }

    async _saveToFirestore() {
        if (!this._useFirebase || !this._userId) return;
        var fb = window._firebase;
        if (!fb || !fb.db) return;

        var docRef = fb.db.collection('users').doc(this._userId).collection('data').doc('tasks');
        var data = {
            tasks: this._tasks.map(function(t) {
                var plain = Object.assign({}, t);
                delete plain.Children;
                return plain;
            }),
            updatedAt: new Date().toISOString()
        };
        try {
            this._isSyncing = true;
            await docRef.set(data);
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
        var map = {};
        this._tasks.forEach(function(t) { t.Children = []; map[t.Id] = t; });
        var roots = [];
        this._tasks.forEach(function(t) {
            if (t.ParentId != null && map[t.ParentId]) {
                map[t.ParentId].Children.push(t);
            } else {
                roots.push(t);
            }
        });
        var sortRec = function(items) {
            items.sort(function(a, b) { return a.SortOrder - b.SortOrder; });
            items.forEach(function(i) { sortRec(i.Children); });
        };
        sortRec(roots);
        return roots;
    }

    // ─── Queries ───
    getAllTasks() { return this.buildTree(); }
    getRawTasks() { return this._tasks; }
    getById(id) { return this._tasks.find(function(t) { return t.Id === id; }) || null; }

    getTasksForStatus(status) {
        return this.buildTree().filter(function(t) { return t.Status === status; });
    }

    getTodayTasks() {
        var today = new Date(); today.setHours(0, 0, 0, 0);
        return this._tasks.filter(function(t) {
            return !t.IsCompleted && t.StartDate && new Date(t.StartDate) <= today;
        }).sort(function(a, b) {
            var da = a.DueDate ? new Date(a.DueDate) : new Date(9999, 0);
            var db = b.DueDate ? new Date(b.DueDate) : new Date(9999, 0);
            return da - db;
        });
    }

    getFocusTasks() {
        var soon = new Date();
        soon.setDate(soon.getDate() + 3);
        soon.setHours(23, 59, 59);
        return this._tasks.filter(function(t) {
            return !t.IsCompleted &&
                (t.Priority === Priority.High || (t.DueDate && new Date(t.DueDate) <= soon));
        }).sort(function(a, b) {
            var da = a.DueDate ? new Date(a.DueDate) : new Date(9999, 0);
            var db = b.DueDate ? new Date(b.DueDate) : new Date(9999, 0);
            if (da - db !== 0) return da - db;
            return PriorityList.indexOf(b.Priority) - PriorityList.indexOf(a.Priority);
        });
    }

    getActiveTasks(showHidden) {
        var today = new Date(); today.setHours(0, 0, 0, 0);
        var tree = this.buildTree();
        var result = [];
        var self = this;
        var walk = function(items, parentHidden) {
            for (var i = 0; i < items.length; i++) {
                var t = items[i];
                var hidden = parentHidden || t.IsHidden;
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
        return this._tasks.filter(function(t) {
            return !t.IsCompleted && t.Contexts.some(function(c) { return c.toLowerCase() === context.toLowerCase(); });
        }).sort(function(a, b) {
            var si = TaskStatusList.indexOf(a.Status) - TaskStatusList.indexOf(b.Status);
            return si !== 0 ? si : a.SortOrder - b.SortOrder;
        });
    }

    getAllContexts() {
        var ctxSet = new Set();
        this._tasks.forEach(function(t) { t.Contexts.forEach(function(c) { ctxSet.add(c); }); });
        return [...ctxSet].sort();
    }

    // ─── Mutations ───
    addTask(title, status, parentId) {
        var siblings = this._tasks.filter(function(t) { return t.ParentId === parentId && t.Status === status; });
        var maxSort = siblings.length > 0 ? Math.max(...siblings.map(function(s) { return s.SortOrder; })) : -1;
        var task = new TaskItem({
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
        var idx = this._tasks.findIndex(function(t) { return t.Id === updated.Id; });
        if (idx === -1) return;
        var old = this._tasks[idx];
        var hiddenChanged = old.IsHidden !== updated.IsHidden;

        var children = this._tasks[idx].Children;
        Object.assign(this._tasks[idx], updated);
        this._tasks[idx].Children = children || [];

        if (hiddenChanged) {
            this._cascadeHidden(updated.Id, updated.IsHidden);
        }
        this._saveAndNotify();
    }

    _cascadeHidden(parentId, isHidden) {
        var children = this._tasks.filter(function(t) { return t.ParentId === parentId; });
        for (var i = 0; i < children.length; i++) {
            children[i].IsHidden = isHidden;
            this._cascadeHidden(children[i].Id, isHidden);
        }
    }

    deleteTask(id) {
        var snapshot = this._captureSubtree([id]);
        this._deleteRecursive(id);
        this._saveAndNotify();
        return snapshot;
    }

    deleteTasks(ids) {
        var snapshot = this._captureSubtree(ids);
        for (var i = 0; i < ids.length; i++) this._deleteRecursive(ids[i]);
        this._saveAndNotify();
        return snapshot;
    }

    _deleteRecursive(id) {
        var children = this._tasks.filter(function(t) { return t.ParentId === id; });
        for (var i = 0; i < children.length; i++) this._deleteRecursive(children[i].Id);
        this._tasks = this._tasks.filter(function(t) { return t.Id !== id; });
    }

    _captureSubtree(rootIds) {
        var result = [];
        var seen = new Set();
        var self = this;
        var collect = function(id) {
            if (seen.has(id)) return;
            seen.add(id);
            var t = self._tasks.find(function(x) { return x.Id === id; });
            if (t) {
                result.push(t.clone());
                self._tasks.filter(function(x) { return x.ParentId === id; }).forEach(function(c) { collect(c.Id); });
            }
        };
        rootIds.forEach(function(id) { collect(id); });
        return result;
    }

    restoreTasks(snapshot) {
        for (var i = 0; i < snapshot.length; i++) {
            var t = snapshot[i];
            this._tasks = this._tasks.filter(function(x) { return x.Id !== t.Id; });
            this._tasks.push(new TaskItem(t));
        }
        this._nextId = Math.max(this._nextId, ...this._tasks.map(function(t) { return t.Id; })) + 1;
        this._saveAndNotify();
    }

    toggleComplete(id) {
        var task = this.getById(id);
        if (!task) return;

        var completed = !task.IsCompleted;
        var seen = new Set();
        var self = this;

        var updateRec = function(t, isCompleted) {
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
            self._tasks.filter(function(c) { return c.ParentId === t.Id; }).forEach(function(c) { updateRec(c, isCompleted); });
        };

        updateRec(task, completed);

        if (completed && task.ParentId != null) {
            var parent = this.getById(task.ParentId);
            while (parent && !parent.IsCompleted) {
                var siblings = this._tasks.filter(function(t) { return t.ParentId === parent.Id; });
                if (siblings.every(function(s) { return s.IsCompleted; })) {
                    updateRec(parent, true);
                    parent = parent.ParentId != null ? self.getById(parent.ParentId) : null;
                } else { break; }
            }
        }
        this._saveAndNotify();
    }

    moveTasks(taskIds, newStatus, newParentId, newSortOrder) {
        if (!taskIds || taskIds.length === 0) return;

        if (newParentId != null) {
            var allDesc = this._getAllDescendantIds(taskIds);
            if (allDesc.has(newParentId) || taskIds.includes(newParentId)) return;
        }

        var selectedSet = new Set(taskIds);
        var rootTasks = this._tasks.filter(function(t) {
            return selectedSet.has(t.Id) && (t.ParentId == null || !selectedSet.has(t.ParentId));
        }).sort(function(a, b) { return a.SortOrder - b.SortOrder; });
        if (rootTasks.length === 0) return;

        var allAffectedIds = this._getAllDescendantIds(taskIds);

        for (var i = 0; i < this._tasks.length; i++) {
            if (allAffectedIds.has(this._tasks[i].Id)) {
                this._tasks[i].Status = newStatus;
            }
        }

        for (var i = 0; i < rootTasks.length; i++) {
            rootTasks[i].ParentId = newParentId;
        }

        var destSiblings = this._tasks.filter(function(t) {
            return t.ParentId === newParentId && t.Status === newStatus && !allAffectedIds.has(t.Id);
        }).sort(function(a, b) { return a.SortOrder - b.SortOrder; });

        var clampedSort = Math.max(0, Math.min(newSortOrder, destSiblings.length));
        destSiblings.splice(clampedSort, 0, ...rootTasks);
        destSiblings.forEach(function(t, i) { t.SortOrder = i; });

        var groups = {};
        this._tasks.forEach(function(t) {
            if (allAffectedIds.has(t.Id)) return;
            var key = (t.ParentId != null ? t.ParentId : 'null') + '_' + t.Status;
            if (!groups[key]) groups[key] = [];
            groups[key].push(t);
        });
        for (var key in groups) {
            groups[key].sort(function(a, b) { return a.SortOrder - b.SortOrder; });
            groups[key].forEach(function(t, i) { t.SortOrder = i; });
        }

        this._saveAndNotify();
    }

    _getAllDescendantIds(rootIds) {
        var result = new Set(rootIds);
        var queue = rootIds.slice();
        while (queue.length > 0) {
            var pid = queue.shift();
            this._tasks.filter(function(t) { return t.ParentId === pid; }).forEach(function(c) {
                if (!result.has(c.Id)) {
                    result.add(c.Id);
                    queue.push(c.Id);
                }
            });
        }
        return result;
    }

    bulkUpdate(model) {
        var tasksToUpdate = this._tasks.filter(function(t) { return model.taskIds.includes(t.Id); });
        for (var i = 0; i < tasksToUpdate.length; i++) {
            var task = tasksToUpdate[i];
            if (model.dueDate) task.DueDate = model.dueDate;
            if (model.priority) task.Priority = model.priority;
            if (model.contextToAdd) {
                var c = model.contextToAdd.startsWith('@') ? model.contextToAdd : '@' + model.contextToAdd;
                if (!task.Contexts.includes(c)) task.Contexts.push(c);
            }
            if (model.contextToRemove) {
                var c = model.contextToRemove.startsWith('@') ? model.contextToRemove : '@' + model.contextToRemove;
                task.Contexts = task.Contexts.filter(function(x) { return x !== c; });
            }
        }
        this._saveAndNotify();
    }

    deleteAllCompleted() {
        var completedIds = this._tasks.filter(function(t) { return t.Status === TaskStatus.Completed; }).map(function(t) { return t.Id; });
        for (var i = 0; i < completedIds.length; i++) this._deleteRecursive(completedIds[i]);
        this._saveAndNotify();
    }

    deleteContext(context) {
        this._tasks.forEach(function(t) {
            t.Contexts = t.Contexts.filter(function(c) { return c !== context; });
        });
        this._saveAndNotify();
    }

    updateExpandState(taskId, isExpanded) {
        var t = this.getById(taskId);
        if (t) {
            t.IsExpanded = isExpanded;
            this.save();
        }
    }

    exportToJson() {
        var data = {
            tasks: this._tasks.map(function(t) {
                var plain = Object.assign({}, t);
                delete plain.Children;
                return plain;
            })
        };
        return JSON.stringify(data, null, 2);
    }

    importFromJson(jsonStr) {
        var data = JSON.parse(jsonStr);
        var tasks = data.tasks || data;
        if (!Array.isArray(tasks) || tasks.length === 0) {
            throw new Error('파일에 유효한 태스크 데이터가 없습니다.');
        }
        if (tasks.length > 1000) {
            throw new Error('태스크가 너무 많습니다 (최대 1000개).');
        }
        var idSet = new Set();
        for (var i = 0; i < tasks.length; i++) {
            if (idSet.has(tasks[i].Id)) throw new Error('ID ' + tasks[i].Id + ' 중복');
            idSet.add(tasks[i].Id);
            if (!tasks[i].Title || tasks[i].Title.trim() === '') throw new Error('ID ' + tasks[i].Id + '의 제목이 비어있습니다.');
        }
        this._tasks = tasks.map(function(t) { return new TaskItem(t); });
        this._nextId = Math.max(...this._tasks.map(function(t) { return t.Id; })) + 1;
        this._saveAndNotify();
    }

    findInTree(tree, id) {
        for (var i = 0; i < tree.length; i++) {
            if (tree[i].Id === id) return tree[i];
            var found = this.findInTree(tree[i].Children, id);
            if (found) return found;
        }
        return null;
    }
}
