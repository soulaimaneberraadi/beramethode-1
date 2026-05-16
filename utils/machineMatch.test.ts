/**
 * Lancer: npx tsx utils/machineMatch.test.ts
 */
import assert from 'node:assert/strict';
import type { Machine, Operation } from '../types';
import {
    validateMachineCoverage,
    operationRequiredClasse,
    isMachineOperational,
    machineCoverageRows,
} from './machineMatch';

const machines: Machine[] = [
    { id: 'm1', name: 'A', classe: 'COUPE', speed: 1, speedMajor: 1, cofs: 1, active: true, status: 'OK' },
    { id: 'm2', name: 'B', classe: 'SURJET', speed: 1, speedMajor: 1, cofs: 1, active: true },
];

const ops: Operation[] = [
    { id: 'o1', order: 1, description: 'x', machineId: 'm1', time: 1 },
];

let v = validateMachineCoverage(ops, machines, ['m1']);
assert.equal(v.ok, true);

v = validateMachineCoverage(ops, machines, ['m2']);
assert.equal(v.ok, false);
assert.ok(v.missingClasses.includes('COUPE'));

// Deux opérations même classe → besoin 2 postes, 1 machine seulement → échec
const twoCoupe: Operation[] = [
    { id: 'a', order: 1, description: '', machineId: 'm1', time: 1 },
    { id: 'b', order: 2, description: '', machineId: 'm1', time: 1 },
];
v = validateMachineCoverage(twoCoupe, machines, ['m1']);
assert.equal(v.ok, false);

// machineClass prioritaire sur machineId (machineId pointe m2 SURJET mais classe forcée COUPE)
const opClass: Operation[] = [{ id: 'c', order: 1, description: '', machineId: 'm2', machineClass: 'COUPE', time: 1 }];
assert.equal(operationRequiredClasse(opClass[0], machines), 'COUPE');
v = validateMachineCoverage(opClass, machines, ['m2']);
assert.equal(v.ok, false);
v = validateMachineCoverage(opClass, machines, ['m1']);
assert.equal(v.ok, true);

// PANNE : ne compte pas dans le parc
const withPanne: Machine[] = [
    ...machines,
    { id: 'm3', name: 'C', classe: 'COUPE', speed: 1, speedMajor: 1, cofs: 1, active: true, status: 'PANNE' },
];
const rowsPanne = machineCoverageRows(ops, withPanne, ['m1', 'm3']);
const coupeRow = rowsPanne.find(r => r.classe === 'COUPE');
assert.ok(coupeRow);
assert.equal(coupeRow!.availableCount, 1);

assert.equal(isMachineOperational({ ...machines[0], status: 'PANNE' }), false);
assert.equal(isMachineOperational({ ...machines[0], status: 'MAINT' }), false);
assert.equal(isMachineOperational(machines[0]), true);

console.log('machineMatch.test.ts OK');
