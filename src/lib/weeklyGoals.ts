export type WeeklyGoals = Record<string, number>;

export const WEEKLY_GOALS: WeeklyGoals = {
    // Content
    Connections: 200,
    Posts: 5,
    Comments: 25,

    // Outreach
    LI_Erstnachricht: 70,
    LI_FollowUp: 70,
    //Calls: 20,
    UW_Proposals: 25,
};

// Weekly goals for **base totals** (not J_/A_ parts). Keys must match the visible base label.
const WEEKLY_GOALS_TEST: Record<string, number> = {
    // Content
    'Connections': 200,
    'Posts': 5,
    'Comments': 25,

    // Outreach (examples—uncomment/adjust if you want colors there too)
    'LI_Erstnachricht': 70,
    'FollowUp': 70,
    // 'Calls': 20,
    'UW_Proposals': 25,
};