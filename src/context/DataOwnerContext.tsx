import React, { createContext, useContext, useMemo } from 'react';
import { buildDataOwnerSnapshot, type DataOwnerSnapshot } from '../../lib/dataIdentity';

const DataOwnerContext = createContext<DataOwnerSnapshot | undefined>(undefined);

export type DataOwnerUserInput = { id: number | string; email: string } | null;

export const DataOwnerProvider: React.FC<{
  user: DataOwnerUserInput;
  isGuest: boolean;
  children: React.ReactNode;
}> = ({ user, isGuest, children }) => {
  const value = useMemo(() => buildDataOwnerSnapshot(user, isGuest), [user, isGuest]);
  return <DataOwnerContext.Provider value={value}>{children}</DataOwnerContext.Provider>;
};

export function useDataOwner(): DataOwnerSnapshot {
  const ctx = useContext(DataOwnerContext);
  if (!ctx) {
    throw new Error('useDataOwner must be used within DataOwnerProvider');
  }
  return ctx;
}
