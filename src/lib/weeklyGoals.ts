export type WeekId = number; // e.g. 202547 = ISO year 2025, week 47

export type WeeklyGoals = Record<string, number>;

export interface GoalSet {
    fromWeek: WeekId;   // inclusive
    toWeek?: WeekId;    // inclusive, if given
    goals: WeeklyGoals;
}

// TODO: adjust concrete values & ranges to your real history
export const GOAL_SETS: GoalSet[] = [
    {
        fromWeek: 202530,
        toWeek: 202552,
        goals: {
            Connections: 200,
            Posts: 5,
            Comments: 25,
            LI_Erstnachricht: 75,
            LI_FollowUp: 75,
            UW_Proposals: 25,
        },
    },
    {
        fromWeek: 202601, // new regime
        goals: {
            Connections: 300,
            Posts: 10,
            Comments: 40,
            LI_Erstnachricht: 100,
            LI_FollowUp: 100,
            UW_Proposals: 30,
        },
    },
];

export function getGoalsForWeek(weekId: WeekId): WeeklyGoals {
    const set = GOAL_SETS.find(
        s =>
            weekId >= s.fromWeek &&
            (s.toWeek == null || weekId <= s.toWeek),
    );
    return set?.goals ?? {};
}

// helper so buildPayload doesn’t need to know about GOAL_SETS structure
export function isGoalKey(name: string): boolean {
    return GOAL_SETS.some(s =>
        Object.prototype.hasOwnProperty.call(s.goals, name),
    );
}
