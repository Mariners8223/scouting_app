import type { Condition, FormSchema, Question } from './types';

/**
 * The 2026 match scouting form, copied from the AppSheet form in the
 * scouting training deck. It is only the starting point: everything here
 * can be changed from the Form Editor tab.
 */

const RATING = ['Good', 'Mid', 'Bad', "Didn't do"];
const ZONES = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
const PLAYED: Condition = { questionId: 'noShow', op: 'notEquals', value: 'Y' };

function doingDefense(prefix: string): Question[] {
  return [
    { id: `${prefix}DoingDefenseHeader`, type: 'header', label: '{team} doing defense' },
    {
      id: `${prefix}DefenseSuccess`,
      type: 'enum',
      label: 'How successful was he at defense',
      required: true,
      options: RATING,
    },
    {
      id: `${prefix}DefenseZone`,
      type: 'enum',
      label: 'Where did he defend?',
      options: ['Opponent alliance zone', 'Neutral zone'],
      showIf: { questionId: `${prefix}DefenseSuccess`, op: 'notEquals', value: "Didn't do" },
    },
  ];
}

/** Inactive shift: the hub is closed, so the robot passes, collects, steals or defends. */
function inactiveShift(prefix: string): Question[] {
  return [
    {
      id: `${prefix}Role`,
      type: 'enum',
      label: 'Role',
      description:
        'Passer = shoots fuel into his alliance zone, Collector = collects to score later, Thief = takes fuel from others, Defense = interferes with others',
      required: true,
      options: ['Passer', 'Rolling fuel', 'Collector', 'Thief', 'Defense', 'None'],
    },
    ...doingDefense(prefix),
  ];
}

function activeShift(prefix: string): Question[] {
  return [
    {
      id: `${prefix}Role`,
      type: 'enum',
      label: 'Role',
      required: true,
      options: ['Passer', 'Fuel Roller', 'Cycler', 'Defense', 'Thief', 'None'],
    },
    {
      id: `${prefix}Cycles`,
      type: 'number',
      label: 'How many cycles',
      description: 'Cycle = collecting and emptying the hopper in any way',
      required: true,
      min: 0,
      step: 1,
    },
    { id: `${prefix}DefenseOnHeader`, type: 'header', label: 'Defense on {team}' },
    {
      id: `${prefix}DefenseOn`,
      type: 'enum',
      label: 'How did he manage?',
      required: true,
      options: ['Good', 'Mid', 'Bad', 'No Defense'],
    },
    ...doingDefense(prefix),
    { id: `${prefix}PassingHeader`, type: 'header', label: 'Rolling fuel / passing' },
    {
      id: `${prefix}Passing`,
      type: 'enum',
      label: 'How good was he at serving',
      required: true,
      options: RATING,
    },
    {
      id: `${prefix}RolledFrom`,
      type: 'enum',
      label: 'Where did he roll fuel from?',
      options: ['Neutral zone', 'Opponent alliance zone'],
      showIf: { questionId: `${prefix}Passing`, op: 'notEquals', value: "Didn't do" },
    },
  ];
}

export const DEFAULT_SCHEMA: FormSchema = {
  id: 'match-2026',
  name: 'Match Scouting 2026',
  year: 2026,
  version: 1,
  updatedAt: '2026-10-23T00:00:00.000Z',
  sections: [
    {
      id: 'info',
      title: 'Info',
      questions: [
        { id: 'scouter', type: 'text', label: 'Scouter name', required: true, keepAfterSubmit: true },
        {
          id: 'match',
          type: 'number',
          label: 'Match number',
          required: true,
          min: 1,
          step: 1,
          keepAfterSubmit: true,
        },
        {
          id: 'team',
          type: 'text',
          label: 'Team number',
          description: 'The team written in the table, not the robot in that spot on the field',
          required: true,
        },
        { id: 'alliance', type: 'enum', label: 'Alliance', required: true, options: ['Red', 'Blue'] },
        {
          id: 'noShow',
          type: 'yesNo',
          label: "Robot didn't show up",
          required: true,
        },
      ],
    },
    {
      id: 'auto',
      title: 'Auto',
      showIf: PLAYED,
      questions: [
        {
          id: 'autoStart',
          type: 'enum',
          label: 'Start position',
          required: true,
          options: ['Trench', 'Bump', 'Hub'],
        },
        {
          id: 'autoCollection',
          type: 'enumList',
          label: 'Collection',
          description: 'Depot = fuel in zone 8/9 at the start, Outpost = human player zone, Neutral = zones 4+5',
          required: true,
          options: ['Depot', 'Outpost', 'Neutral', 'Nothing'],
        },
        {
          id: 'autoShotFrom',
          type: 'enumList',
          label: 'Where did he throw from',
          required: true,
          options: [...ZONES, 'Non'],
        },
        { id: 'autoEndZone', type: 'enum', label: 'Where did he end up', required: true, options: ZONES },
        { id: 'autoTowerHeader', type: 'header', label: 'Tower' },
        {
          id: 'autoTowerPosition',
          type: 'enum',
          label: 'Position',
          required: true,
          options: ['Side', 'Side-Mid', 'Mid', "Didn't"],
        },
        {
          id: 'autoClimbSuccess',
          type: 'enum',
          label: 'Success?',
          required: true,
          options: ['Y', 'N', "Didn't climb"],
        },
        {
          id: 'autoWinner',
          type: 'enum',
          label: 'Which alliance won Auto?',
          description: 'Decides the order of the Active / Inactive tabs',
          required: true,
          options: ['His alliance', 'Other alliance'],
        },
      ],
    },
    { id: 'active1', title: 'Active', showIf: PLAYED, questions: activeShift('active1') },
    { id: 'inactive1', title: 'Inactive', showIf: PLAYED, questions: inactiveShift('inactive1') },
    { id: 'active2', title: 'Active 2', showIf: PLAYED, questions: activeShift('active2') },
    { id: 'inactive2', title: 'Inactive 2', showIf: PLAYED, questions: inactiveShift('inactive2') },
    {
      id: 'endgame',
      title: 'Endgame',
      showIf: PLAYED,
      questions: [
        {
          id: 'climbTime',
          type: 'number',
          label: 'Time for climbing (sec)',
          description: 'From under the tower until in the air and done moving',
          required: true,
          min: 0,
          step: 1,
        },
        {
          id: 'climbLevel',
          type: 'enum',
          label: 'Level',
          required: true,
          options: ['L3', 'L2', 'L1', "Didn't climb"],
        },
        {
          id: 'climbPosition',
          type: 'enum',
          label: 'Position',
          required: true,
          options: ['Side', 'Side-Mid', 'Mid', "Didn't"],
        },
        {
          id: 'climbSuccess',
          type: 'enum',
          label: 'Success?',
          required: true,
          options: ['Y', 'N', "Didn't climb"],
        },
      ],
    },
    {
      id: 'general',
      title: 'General',
      questions: [
        {
          id: 'collectionQuality',
          type: 'enum',
          label: 'How good was his collection',
          required: true,
          options: RATING,
          showIf: PLAYED,
        },
        {
          id: 'shootWhileCollect',
          type: 'yesNo',
          label: 'Shoot and collect at the same time',
          required: true,
          showIf: PLAYED,
        },
        { id: 'fell', type: 'yesNo', label: 'Fall', required: true, showIf: PLAYED },
        { id: 'wobble', type: 'yesNo', label: 'Wobble', required: true, showIf: PLAYED },
        { id: 'stuckOnBump', type: 'yesNo', label: 'Stuck on bump', required: true, showIf: PLAYED },
        {
          id: 'disabled',
          type: 'yesNo',
          label: 'Disable / stopped moving',
          required: true,
          showIf: PLAYED,
        },
        { id: 'stuckOnFuel', type: 'yesNo', label: 'Stuck on fuel', required: true, showIf: PLAYED },
        {
          id: 'comments',
          type: 'longText',
          label: 'Comments',
          description: 'In Hebrew only. If he fell, why? If he didn\'t show up, write it here.',
          required: true,
        },
        { id: 'defenseDescription', type: 'longText', label: 'Defense description' },
      ],
    },
  ],
  orderRule: {
    questionId: 'autoWinner',
    variants: {
      // Winning Auto means the alliance's hub starts inactive.
      'His alliance': ['info', 'auto', 'inactive1', 'active1', 'inactive2', 'active2', 'endgame', 'general'],
      'Other alliance': ['info', 'auto', 'active1', 'inactive1', 'active2', 'inactive2', 'endgame', 'general'],
    },
  },
};
