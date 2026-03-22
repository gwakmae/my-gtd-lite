// Task status enum
const TaskStatus = Object.freeze({
    Inbox: 'Inbox',
    NextActions: 'NextActions',
    Projects: 'Projects',
    Someday: 'Someday',
    Completed: 'Completed'
});

const TaskStatusList = [
    TaskStatus.Inbox,
    TaskStatus.NextActions,
    TaskStatus.Projects,
    TaskStatus.Someday,
    TaskStatus.Completed
];

const Priority = Object.freeze({
    Low: 'Low',
    Medium: 'Medium',
    High: 'High'
});

const PriorityList = [Priority.Low, Priority.Medium, Priority.High];