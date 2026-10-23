import type { Condition, FormSchema, Question } from './types';

/**
 * The 2026 match scouting form, copied from the AppSheet form in the
 * scouting training deck. It is only the starting point: everything here
 * can be changed from the Form Editor tab.
 *
 * Each answer goes to the same column of the AppSheet "Table" that the 2026
 * dashboards read, with the same answer texts, so they keep working.
 */

const RATING = ['Good', 'Mid', 'Bad', "Didn't do"];
const ZONES = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
const PLAYED: Condition = { questionId: 'noShow', op: 'notEquals', value: 'Y' };

/** AppSheet columns of each shift tab. */
const ACTIVE_COLUMNS = {
  active1: { role: 'W', cycles: 'X', defenseOn: 'Z', fightOrFlight: 'AA', defense: 'AC', from: 'AE', to: 'AF', serving: 'BW' },
  active2: { role: 'AO', cycles: 'AP', defenseOn: 'AR', fightOrFlight: 'AS', defense: 'AU', from: 'AW', to: 'AX', serving: 'BX' },
};
const INACTIVE_COLUMNS = {
  inactive1: { role: 'AH', zone: 'AJ', defense: 'AK', description: 'AL' },
  inactive2: { role: 'AZ', zone: 'BB', defense: 'BC', description: 'BD' },
};

function doingDefense(prefix: string, columns: { defense: string; zone?: string }): Question[] {
  return [
    { id: `${prefix}DoingDefenseHeader`, type: 'header', label: '{team} doing defense' },
    {
      id: `${prefix}DefenseSuccess`,
      type: 'enum',
      label: 'How successful was he at defense',
      required: true,
      options: RATING,
      column: columns.defense,
    },
    {
      id: `${prefix}DefenseZone`,
      type: 'enum',
      label: 'Where did he defend?',
      options: ['Opponent alliance zone', 'Neutral zone'],
      showIf: { questionId: `${prefix}DefenseSuccess`, op: 'notEquals', value: "Didn't do" },
      column: columns.zone,
    },
  ];
}

/** Inactive shift: the hub is closed, so the robot passes, collects, steals or defends. */
function inactiveShift(prefix: keyof typeof INACTIVE_COLUMNS): Question[] {
  const columns = INACTIVE_COLUMNS[prefix];
  return [
    {
      id: `${prefix}Role`,
      type: 'enumList',
      label: 'Role',
      description:
        'Passer = shoots fuel into his alliance zone, Collector = collects to score later, Thief = takes fuel from others, Defense = interferes with others',
      required: true,
      options: ['Passer', 'Rolling fuel', 'Collector', 'Thief', 'Defense', 'None'],
      column: columns.role,
    },
    ...doingDefense(prefix, columns),
    {
      id: `${prefix}DefenseDescription`,
      type: 'longText',
      label: 'Describe his defense',
      showIf: { questionId: `${prefix}DefenseSuccess`, op: 'notEquals', value: "Didn't do" },
      column: columns.description,
    },
  ];
}

function activeShift(prefix: keyof typeof ACTIVE_COLUMNS): Question[] {
  const columns = ACTIVE_COLUMNS[prefix];
  return [
    {
      id: `${prefix}Role`,
      type: 'enumList',
      label: 'Role',
      required: true,
      options: ['Passer', 'Fuel Roller', 'Cycler', 'Defense', 'Thief', 'None'],
      column: columns.role,
    },
    {
      id: `${prefix}Cycles`,
      type: 'number',
      label: 'How many cycles',
      description: 'Cycle = collecting and emptying the hopper in any way',
      required: true,
      min: 0,
      step: 1,
      column: columns.cycles,
    },
    { id: `${prefix}DefenseOnHeader`, type: 'header', label: 'Defense on {team}' },
    {
      id: `${prefix}DefenseOn`,
      type: 'enum',
      label: 'How did he manage?',
      required: true,
      options: ['Good', 'Mid', 'Bad', 'No Defense'],
      column: columns.defenseOn,
    },
    {
      id: `${prefix}FightOrFlight`,
      type: 'enum',
      label: 'Fight or flight',
      description: 'Fight = pushed back against the defender, Flight = drove away from him',
      required: true,
      options: ['Fight', 'Flight', 'No defense'],
      column: columns.fightOrFlight,
    },
    ...doingDefense(prefix, columns),
    { id: `${prefix}PassingHeader`, type: 'header', label: 'Rolling fuel / passing' },
    {
      id: `${prefix}Passing`,
      type: 'enum',
      label: 'How good was he at serving',
      required: true,
      options: RATING,
      column: columns.serving,
    },
    {
      id: `${prefix}RolledFrom`,
      type: 'enum',
      label: 'Where did he roll fuel from?',
      description: 'Enemy = the opponent alliance zone',
      options: ['Neutral', 'Enemy'],
      showIf: { questionId: `${prefix}Passing`, op: 'notEquals', value: "Didn't do" },
      column: columns.from,
    },
    {
      id: `${prefix}RolledTo`,
      type: 'enum',
      label: 'Where did he roll fuel to?',
      description: 'Alliance = his alliance zone',
      options: ['Alliance', 'Neutral'],
      showIf: { questionId: `${prefix}Passing`, op: 'notEquals', value: "Didn't do" },
      column: columns.to,
    },
  ];
}

export const DEFAULT_SCHEMA: FormSchema = {
  id: 'match-2026',
  name: 'Match Scouting 2026',
  year: 2026,
  version: 1,
  updatedAt: '2026-10-23T00:00:00.000Z',
  sheetName: 'Table',
  columnLayout: { key: 'A', constants: { C: 'Mariners' } },
  sections: [
    {
      id: 'info',
      title: 'Info',
      questions: [
        {
          id: 'scouter',
          type: 'text',
          label: 'Scouter name',
          required: true,
          keepAfterSubmit: true,
          column: 'D',
        },
        {
          id: 'event',
          type: 'enum',
          label: 'Event',
          required: true,
          options: ['ISR', 'D1', 'D2', 'D3', 'D4', 'DCMP', 'Practice'],
          keepAfterSubmit: true,
          column: 'F',
        },
        {
          id: 'match',
          type: 'number',
          label: 'Match number',
          required: true,
          min: 1,
          step: 1,
          keepAfterSubmit: true,
          column: 'G',
        },
        {
          id: 'team',
          type: 'text',
          label: 'Team number',
          description: 'The team written in the table, not the robot in that spot on the field',
          required: true,
          column: 'E',
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
          column: 'I',
        },
        {
          id: 'autoCollection',
          type: 'enumList',
          label: 'Collection',
          description: 'Depot = fuel in zone 8/9 at the start, Outpost = human player zone, Neutral = zones 4+5',
          required: true,
          options: ['Depot', 'Outpost', 'Neutral', 'Nothing'],
          column: 'M',
        },
        {
          id: 'autoShotFrom',
          type: 'enumList',
          label: 'Where did he throw from',
          required: true,
          options: [...ZONES, 'Non'],
          column: 'K',
        },
        {
          id: 'autoEndZone',
          type: 'enum',
          label: 'Where did he end up',
          required: true,
          options: ZONES,
          column: 'L',
        },
        { id: 'autoTowerHeader', type: 'header', label: 'Tower' },
        {
          id: 'autoTowerPosition',
          type: 'enum',
          label: 'Position',
          required: true,
          options: ['Side', 'Side-Mid', 'Mid', "Didn't"],
          column: 'O',
        },
        {
          id: 'autoClimbSuccess',
          type: 'enum',
          label: 'Success?',
          required: true,
          options: ['Y', 'N', "Didn't climb"],
          column: 'P',
        },
        {
          id: 'autoWon',
          type: 'yesNo',
          label: 'Did his alliance win Auto?',
          description: 'Decides the order of the Active / Inactive tabs',
          required: true,
          column: 'Q',
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
          column: 'BI',
        },
        {
          id: 'climbLevel',
          type: 'enum',
          label: 'Level',
          required: true,
          options: ['L3', 'L2', 'L1', "Didn't climb"],
          column: 'BH',
        },
        {
          id: 'climbPosition',
          type: 'enum',
          label: 'Position',
          required: true,
          options: ['Side', 'Side-Mid', 'Mid', "Didn't"],
          column: 'BJ',
        },
        {
          id: 'climbSuccess',
          type: 'enum',
          label: 'Success?',
          required: true,
          options: ['Y', 'N', "Didn't climb"],
          column: 'BK',
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
          column: 'CD',
        },
        {
          id: 'shootWhileCollect',
          type: 'yesNo',
          label: 'Shoot and collect at the same time',
          required: true,
          showIf: PLAYED,
          column: 'BR',
        },
        { id: 'fell', type: 'yesNo', label: 'Fall', required: true, showIf: PLAYED, column: 'BN' },
        { id: 'wobble', type: 'yesNo', label: 'Wobble', required: true, showIf: PLAYED, column: 'BO' },
        {
          id: 'stuckOnBump',
          type: 'yesNo',
          label: 'Stuck on bump',
          required: true,
          showIf: PLAYED,
          column: 'BP',
        },
        {
          id: 'disabled',
          type: 'yesNo',
          label: 'Disable / stopped moving',
          required: true,
          showIf: PLAYED,
          column: 'BQ',
        },
        {
          id: 'stuckOnFuel',
          type: 'yesNo',
          label: 'Stuck on fuel',
          required: true,
          showIf: PLAYED,
          column: 'CC',
        },
        {
          id: 'comments',
          type: 'longText',
          label: 'Comments',
          description: 'In Hebrew only. If he fell, why? If he didn\'t show up, write it here.',
          required: true,
          column: 'BS',
        },
        {
          id: 'cycleDescription',
          type: 'longText',
          label: 'Cycle description',
          description: 'What does a normal cycle of his look like? Where does he collect and shoot from?',
          showIf: PLAYED,
          column: 'BT',
        },
        {
          id: 'servingComments',
          type: 'longText',
          label: 'Comments about his serving',
          description: 'How he drives while rolling or passing fuel: paths, speed, getting stuck',
          showIf: PLAYED,
          column: 'BU',
        },
        {
          id: 'defenseDescription',
          type: 'longText',
          label: 'Comments about his defense',
          description: 'How he defended or blocked: pinning, blocking the bump or trench, stealing fuel',
          showIf: PLAYED,
          column: 'BV',
        },
        {
          id: 'transitionComments',
          type: 'longText',
          label: 'Comments about defense on him',
          description: 'How did he handle robots that defended him?',
          showIf: PLAYED,
          column: 'CB',
        },
      ],
    },
  ],
  orderRule: {
    questionId: 'autoWon',
    variants: {
      // Winning Auto means the alliance's hub starts inactive.
      Y: ['info', 'auto', 'inactive1', 'active1', 'inactive2', 'active2', 'endgame', 'general'],
      N: ['info', 'auto', 'active1', 'inactive1', 'active2', 'inactive2', 'endgame', 'general'],
    },
  },
};
