class DataService {
    constructor() {
        this._tasks = [];
        this._nextId = 1;
        this._listeners = [];
        this._storageKey = 'gtd-tasks-data';
        this._useFirebase = false;
        this._userId = null;
        this._unsubscribe = null;
        this._syncStatus = document.getElementById('sync-status');
        this._offlineBadge = document.getElementById('offline-badge');
        this._isSyncing = false;
    }

    onChange(fn) { this._listeners.push(fn); }
    _notify() { this._listeners.forEach(fn => fn()); }

    init() { this._loadFromLocalStorage(); }

    async enableFirebase(userId) {
        this._useFirebase = true;
        this._userId = userId;
        this._setSyncStatus('동기화 중...');
        var fb = window._firebase;
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
            var self = this;
            this._unsubscribe = docRef.onSnapshot(function(snap) {
                if (self._isSyncing) return;
                if (snap.exists) {
                    var data = snap.data();
                    var remoteTasks = (data.tasks || []).map(function(t) { return new TaskItem(t); });
                    self._tasks = remoteTasks;
                    self._recalcNextId();
                    self._saveToLocalStorage();
                    self._notify();
                    self._setSyncStatus('✓ 실시간 동기화');
                }
            });
        } catch (e) {
            console.error('[Firebase] Load error:', e);
            this._setSyncStatus('⚠ 동기화 실패 (로컬 모드)');
            this._useFirebase = false;
        }
    }

    disableFirebase() {
        if (this._unsubscribe) { this._unsubscribe(); this._unsubscribe = null; }
        this._useFirebase = false;
        this._userId = null;
        this._setSyncStatus('');
    }

    _setSyncStatus(msg) {
        if (this._syncStatus) this._syncStatus.textContent = msg;
        if (msg) {
            var self = this;
            clearTimeout(this._syncClearTimer);
            this._syncClearTimer = setTimeout(function() {
                if (self._syncStatus) self._syncStatus.textContent = '';
            }, 5000);
        }
    }

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
        if (this._tasks.length === 0) this._loadEmbeddedData();
        this._recalcNextId();
    }

    _loadEmbeddedData() {
        var el = document.getElementById('embedded-sample');
        if (el) {
            try {
                var data = JSON.parse(el.textContent);
                this._tasks = (data.tasks || data).map(function(t) { return new TaskItem(t); });
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
            this._nextId = Math.max.apply(null, this._tasks.map(function(t) { return t.Id; })) + 1;
        }
    }

    save() {
        this._saveToLocalStorage();
        if (this._useFirebase) this._saveToFirestore();
    }

    _saveToLocalStorage() {
        var data = { tasks: this._tasks.map(function(t) { var p = Object.assign({}, t); delete p.Children; return p; }) };
        localStorage.setItem(this._storageKey, JSON.stringify(data));
    }

    async _saveToFirestore() {
        if (!this._useFirebase || !this._userId) return;
        var fb = window._firebase;
        var docRef = fb.db.collection('users').doc(this._userId).collection('data').doc('tasks');
        var data = {
            tasks: this._tasks.map(function(t) { var p = Object.assign({}, t); delete p.Children; return p; }),
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

    buildTree(taskList) {
        var source = taskList || this._tasks;
        var map = {};
        source.forEach(function(t) { t.Children = []; map[t.Id] = t; });
        var roots = [];
        source.forEach(function(t) {
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

    getAllTasks() { return this.buildTree(); }
    getRawTasks() { return this._tasks; }
    getById(id) { return this._tasks.find(function(t) { return t.Id === id; }) || null; }

    getTasksForStatus(status) {
        var statusTasks = this._tasks.filter(function(t) { return t.Status === status; });
        return this.buildTree(statusTasks);
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
        var soon = new Date(); soon.setDate(soon.getDate() + 3); soon.setHours(23, 59, 59);
        return this._tasks.filter(function(t) {
            return !t.IsCompleted && (t.Priority === Priority.High || (t.DueDate && new Date(t.DueDate) <= soon));
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
        var walk = function(items, parentHidden) {
            for (var i = 0; i < items.length; i++) {
                var t = items[i];
                var hidden = parentHidden || t.IsHidden;
                if (showHidden || !hidden) {
                    if (t.Status !== TaskStatus.Inbox && t.Children.length === 0 && !t.IsCompleted && (!t.StartDate || new Date(t.StartDate) <= today)) {
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
        return Array.from(ctxSet).sort();
    }

    addTask(title, status, parentId) {
        var siblings = this._tasks.filter(function(t) { return t.ParentId === parentId && t.Status === status; });
        var maxSort = siblings.length > 0 ? Math.max.apply(null, siblings.map(function(s) { return s.SortOrder; })) : -1;
        var task = new TaskItem({ Id: this._nextId++, Title: title, Status: status, ParentId: parentId, SortOrder: maxSort + 1 });
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
        if (hiddenChanged) this._cascadeHidden(updated.Id, updated.IsHidden);
        this._saveAndNotify();
    }

    _cascadeHidden(parentId, isHidden) {
        var self = this;
        var children = this._tasks.filter(function(t) { return t.ParentId === parentId; });
        for (var i = 0; i < children.length; i++) { children[i].IsHidden = isHidden; self._cascadeHidden(children[i].Id, isHidden); }
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
        var self = this;
        var children = this._tasks.filter(function(t) { return t.ParentId === id; });
        for (var i = 0; i < children.length; i++) self._deleteRecursive(children[i].Id);
        this._tasks = this._tasks.filter(function(t) { return t.Id !== id; });
    }

    _captureSubtree(rootIds) {
        var result = []; var seen = new Set(); var self = this;
        var collect = function(id) {
            if (seen.has(id)) return; seen.add(id);
            var t = self._tasks.find(function(x) { return x.Id === id; });
            if (t) { result.push(t.clone()); self._tasks.filter(function(x) { return x.ParentId === id; }).forEach(function(c) { collect(c.Id); }); }
        };
        rootIds.forEach(function(id) { collect(id); });
        return result;
    }

    restoreTasks(snapshot) {
        var self = this;
        for (var i = 0; i < snapshot.length; i++) {
            self._tasks = self._tasks.filter(function(x) { return x.Id !== snapshot[i].Id; });
            self._tasks.push(new TaskItem(snapshot[i]));
        }
        this._nextId = Math.max(this._nextId, Math.max.apply(null, this._tasks.map(function(t) { return t.Id; }))) + 1;
        this._saveAndNotify();
    }

    // ★★★ 수정: toggleComplete ★★★
    // - 체크하면 해당 태스크(+자식)만 IsCompleted=true, Status=Completed로 이동
    // - 부모는 자동 완료하지 않음 (사용자가 직접 부모를 체크해야 함)
    // - 체크 해제하면 해당 태스크(+자식)를 원래 Status로 복원
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
            // 자식들도 함께 완료/해제
            self._tasks.filter(function(c) { return c.ParentId === t.Id; }).forEach(function(c) { updateRec(c, isCompleted); });
        };

        updateRec(task, completed);

        // ★ 부모 자동 완료 로직 제거 ★
        // 이전: 자식 모두 완료 시 부모도 자동 완료
        // 변경: 부모는 사용자가 직접 체크해야 완료됨

        this._saveAndNotify();
    }

    moveTasks(taskIds, newStatus, newParentId, newSortOrder) {
        if (!Array.isArray(taskIds) || taskIds.length === 0) return;
        var selectedSet = new Set(taskIds);
        var rootTasks = this._tasks
            .filter(function(t) { return selectedSet.has(t.Id) && (t.ParentId == null || !selectedSet.has(t.ParentId)); })
            .sort(function(a, b) { return a.SortOrder - b.SortOrder; });
        if (rootTasks.length === 0) return;
        var movingRootIds = new Set(rootTasks.map(function(t) { return t.Id; }));
        var self = this;
        var sourceGroups = new Set(rootTasks.map(function(t) { return self._groupKey(t.ParentId, t.Status); }));
        var resolved = this._resolveDropLocation(rootTasks, newStatus, newParentId, newSortOrder);
        if (!resolved) return;
        newStatus = resolved.status; newParentId = resolved.parentId; newSortOrder = resolved.sortOrder;
        if (newParentId != null) {
            var allDesc = this._getAllDescendantIds(Array.from(movingRootIds));
            if (allDesc.has(newParentId) || movingRootIds.has(newParentId)) return;
        }
        var allAffectedIds = this._getAllDescendantIds(Array.from(movingRootIds));
        for (var i = 0; i < this._tasks.length; i++) {
            if (allAffectedIds.has(this._tasks[i].Id)) this._tasks[i].Status = newStatus;
        }
        for (var i = 0; i < rootTasks.length; i++) rootTasks[i].ParentId = newParentId;
        sourceGroups.forEach(function(key) {
            var group = self._parseGroupKey(key);
            if (group.parentId === newParentId && group.status === newStatus) return;
            var remaining = self._tasks.filter(function(t) { return t.ParentId === group.parentId && t.Status === group.status && !movingRootIds.has(t.Id); }).sort(function(a, b) { return a.SortOrder - b.SortOrder; });
            remaining.forEach(function(t, i) { t.SortOrder = i; });
        });
        var destSiblings = this._tasks.filter(function(t) { return t.ParentId === newParentId && t.Status === newStatus && !movingRootIds.has(t.Id); }).sort(function(a, b) { return a.SortOrder - b.SortOrder; });
        var insertIndex = Math.max(0, Math.min(Number(newSortOrder), destSiblings.length));
        var args = [insertIndex, 0].concat(rootTasks);
        Array.prototype.splice.apply(destSiblings, args);
        destSiblings.forEach(function(t, i) { t.SortOrder = i; });
        this._saveAndNotify();
    }

    _resolveDropLocation(rootTasks, status, parentIdOrTargetId, sortOrderOrPosition) {
        var movingRootIds = new Set(rootTasks.map(function(t) { return t.Id; }));
        if (typeof sortOrderOrPosition === 'number' && Number.isFinite(sortOrderOrPosition)) {
            return { status: status, parentId: parentIdOrTargetId, sortOrder: sortOrderOrPosition };
        }
        var position = sortOrderOrPosition;
        if (position === 'Inside' && parentIdOrTargetId == null) {
            var siblings = this._tasks.filter(function(t) { return t.ParentId == null && t.Status === status && !movingRootIds.has(t.Id); }).sort(function(a, b) { return a.SortOrder - b.SortOrder; });
            return { status: status, parentId: null, sortOrder: siblings.length };
        }
        var targetTask = this.getById(parentIdOrTargetId);
        if (!targetTask) return null;
        if (position === 'Inside') {
            var children = this._tasks.filter(function(t) { return t.ParentId === targetTask.Id && t.Status === targetTask.Status && !movingRootIds.has(t.Id); }).sort(function(a, b) { return a.SortOrder - b.SortOrder; });
            return { status: targetTask.Status, parentId: targetTask.Id, sortOrder: children.length };
        }
        var actualParentId = targetTask.ParentId;
        var siblings = this._tasks.filter(function(t) { return t.ParentId === actualParentId && t.Status === targetTask.Status && !movingRootIds.has(t.Id); }).sort(function(a, b) { return a.SortOrder - b.SortOrder; });
        var targetIndex = siblings.findIndex(function(t) { return t.Id === targetTask.Id; });
        if (targetIndex === -1) return null;
        return { status: targetTask.Status, parentId: actualParentId, sortOrder: position === 'Above' ? targetIndex : targetIndex + 1 };
    }

    _groupKey(parentId, status) { return (parentId == null ? 'null' : parentId) + '::' + status; }
    _parseGroupKey(key) { var p = key.split('::'); return { parentId: p[0] === 'null' ? null : Number(p[0]), status: p[1] }; }

    _getAllDescendantIds(rootIds) {
        var result = new Set(rootIds); var queue = rootIds.slice(); var self = this;
        while (queue.length > 0) { var pid = queue.shift(); self._tasks.filter(function(t) { return t.ParentId === pid; }).forEach(function(c) { if (!result.has(c.Id)) { result.add(c.Id); queue.push(c.Id); } }); }
        return result;
    }

    bulkUpdate(model) {
        var tasksToUpdate = this._tasks.filter(function(t) { return model.taskIds.includes(t.Id); });
        for (var i = 0; i < tasksToUpdate.length; i++) {
            var task = tasksToUpdate[i];
            if (model.dueDate) task.DueDate = model.dueDate;
            if (model.priority) task.Priority = model.priority;
            if (model.contextToAdd) { var c = model.contextToAdd.startsWith('@') ? model.contextToAdd : '@' + model.contextToAdd; if (!task.Contexts.includes(c)) task.Contexts.push(c); }
            if (model.contextToRemove) { var c = model.contextToRemove.startsWith('@') ? model.contextToRemove : '@' + model.contextToRemove; task.Contexts = task.Contexts.filter(function(x) { return x !== c; }); }
        }
        this._saveAndNotify();
    }

    deleteAllCompleted() {
        var completedIds = this._tasks.filter(function(t) { return t.Status === TaskStatus.Completed; }).map(function(t) { return t.Id; });
        for (var i = 0; i < completedIds.length; i++) this._deleteRecursive(completedIds[i]);
        this._saveAndNotify();
    }

    deleteContext(context) { this._tasks.forEach(function(t) { t.Contexts = t.Contexts.filter(function(c) { return c !== context; }); }); this._saveAndNotify(); }

    updateExpandState(taskId, isExpanded) { var t = this.getById(taskId); if (t) { t.IsExpanded = isExpanded; this.save(); } }

    exportToJson() {
        var data = { tasks: this._tasks.map(function(t) { var p = Object.assign({}, t); delete p.Children; return p; }) };
        return JSON.stringify(data, null, 2);
    }

    // ★ 선택된 Task들만 Export (해당 Task + 모든 하위 자식 포함) ★
    exportSelectedToJson(taskIds) {
        var self = this;
        var allIds = this._getAllDescendantIds(taskIds);
        var selectedTasks = this._tasks.filter(function(t) { return allIds.has(t.Id); });

        // 선택된 task들의 ID 세트
        var selectedIdSet = new Set(selectedTasks.map(function(t) { return t.Id; }));

        // 트리 구조로 변환
        var buildHierarchy = function(tasks) {
            var map = {};
            var roots = [];
            tasks.forEach(function(t) {
                var obj = {
                    Id: t.Id,
                    Title: t.Title,
                    Description: t.Description || '',
                    Priority: t.Priority,
                    Status: t.Status,
                    ParentId: t.ParentId,
                    SortOrder: t.SortOrder,
                    IsCompleted: t.IsCompleted,
                    StartDate: t.StartDate,
                    DueDate: t.DueDate,
                    Contexts: t.Contexts ? [].concat(t.Contexts) : [],
                    IsHidden: t.IsHidden,
                    Children: []
                };
                map[t.Id] = obj;
            });
            tasks.forEach(function(t) {
                if (t.ParentId != null && map[t.ParentId]) {
                    map[t.ParentId].Children.push(map[t.Id]);
                } else {
                    roots.push(map[t.Id]);
                }
            });
            // Sort children
            var sortRec = function(items) {
                items.sort(function(a, b) { return a.SortOrder - b.SortOrder; });
                items.forEach(function(i) { sortRec(i.Children); });
            };
            sortRec(roots);
            return roots;
        };

        var hierarchy = buildHierarchy(selectedTasks);

        // flat 리스트도 포함 (import 호환을 위해)
        var flatTasks = selectedTasks.map(function(t) {
            var p = Object.assign({}, t);
            delete p.Children;
            return p;
        });

        var data = {
            exportDate: new Date().toISOString(),
            exportType: 'selected',
            taskCount: selectedTasks.length,
            tasks: flatTasks,
            hierarchy: hierarchy
        };
        return JSON.stringify(data, null, 2);
    }

    importFromJson(jsonStr) {
        var data = JSON.parse(jsonStr); var tasks = data.tasks || data;
        if (!Array.isArray(tasks) || tasks.length === 0) throw new Error('파일에 유효한 태스크 데이터가 없습니다.');
        if (tasks.length > 1000) throw new Error('태스크가 너무 많습니다 (최대 1000개).');
        var idSet = new Set();
        for (var i = 0; i < tasks.length; i++) { if (idSet.has(tasks[i].Id)) throw new Error('ID ' + tasks[i].Id + ' 중복'); idSet.add(tasks[i].Id); if (!tasks[i].Title || tasks[i].Title.trim() === '') throw new Error('ID ' + tasks[i].Id + '의 제목이 비어있습니다.'); }
        this._tasks = tasks.map(function(t) { return new TaskItem(t); });
        this._nextId = Math.max.apply(null, this._tasks.map(function(t) { return t.Id; })) + 1;
        this._saveAndNotify();
    }

    findInTree(tree, id) { for (var i = 0; i < tree.length; i++) { if (tree[i].Id === id) return tree[i]; var f = this.findInTree(tree[i].Children, id); if (f) return f; } return null; }
}
