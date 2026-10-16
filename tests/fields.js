// The example fields used by the tests: a customer list.
export const FIELDS = [
  { key: 'name', label: 'Name', required: true, aliases: ['full name', 'customer'] },
  { key: 'email', label: 'Email', type: 'email', required: true, unique: true, aliases: ['e-mail address', 'mail'] },
  { key: 'plan', label: 'Plan', type: 'enum', options: [{ value: 'free', label: 'Free' }, { value: 'pro', label: 'Pro', aliases: ['premium'] }, { value: 'team', label: 'Team' }] },
  { key: 'seats', label: 'Seats', type: 'integer', min: 1, max: 500 },
  { key: 'signedUp', label: 'Signed up', type: 'date', aliases: ['sign-up date', 'created'] },
  { key: 'newsletter', label: 'Newsletter', type: 'boolean' },
];
