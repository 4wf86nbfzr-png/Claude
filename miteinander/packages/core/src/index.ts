/** Öffentliche Schnittstelle des Anwendungskerns. */

export * from './config/app-config';
export * from './domain/enums';
export * from './domain/types';
export * from './domain/service-categories';

export * from './a11y/preferences';
export * from './a11y/contrast';
export * from './a11y/announcements';

export * from './matching/geo';
export * from './matching/eligibility';
export * from './matching/fairness';
export * from './matching/matcher';

export * from './requests/wizard';
export * from './booking/state-machine';
export * from './booking/summary';

export * from './privacy/visibility';
export * from './privacy/consent';
export * from './privacy/retention';

export * from './security/permissions';
export * from './security/verification';
export * from './security/incidents';
export * from './security/approvals';

export * from './voice/commands';
export * from './content/dgs';
export * from './content/dgs-skripte';
export * from './content/untertitel';
export * from './content/easy-language';

export * from './data/repositories';
export * from './data/memory/memory-context';
export * from './services/support-service';
export * from './seed/demo-data';
