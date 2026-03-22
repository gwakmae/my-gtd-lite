class TaskItem {
    constructor(data = {}) {
        this.Id = data.Id || 0;
        this.Title = data.Title || '';
        this.Description = data.Description || '';
        this.Priority = data.Priority || Priority.Low;
        this.Status = data.Status || TaskStatus.Inbox;
        this.ParentId = data.ParentId ?? null;
        this.SortOrder = data.SortOrder ?? 0;
        this.IsCompleted = data.IsCompleted ?? false;
        this.StartDate = data.StartDate ?? null;
        this.DueDate = data.DueDate ?? null;
        this.OriginalStatus = data.OriginalStatus ?? null;
        this.Contexts = data.Contexts ? [...data.Contexts] : [];
        this.IsExpanded = data.IsExpanded ?? true;
        this.IsHidden = data.IsHidden ?? false;
        // Runtime (not persisted in same way)
        this.Children = [];
    }

    clone() {
        const c = new TaskItem(JSON.parse(JSON.stringify(this)));
        c.Children = [];
        return c;
    }
}