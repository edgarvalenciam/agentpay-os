import { it,expect } from 'vitest';
import { mxnToMinor,minorToMxn } from '../src/index.js';
it.each([['850',85000],['849.99',84999],['0.01',1],['0',0],['1.2',120],['1000000.00',100000000]])('normalizes %s exactly',(input,expected)=>{expect(mxnToMinor(input)).toBe(expected);expect(mxnToMinor(minorToMxn(expected))).toBe(expected);});
it.each(['850.001','1e3','-1','NaN','Infinity','1,000','9007199254740992',''])('rejects ambiguous or inexact money %s',value=>{expect(()=>mxnToMinor(value)).toThrow();});
