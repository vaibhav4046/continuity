import { describe, it, expect } from 'vitest'
import { allergyGuard, toSecondPerson } from './brain.js'

describe('P0 — second-person rendering (no "The user" leak)', () => {
  it('rewrites stored third-person memory to second person', () => {
    expect(toSecondPerson('The user has an interview with Katie.')).toBe('You have an interview with Katie.')
    expect(toSecondPerson('The user needs to follow up with Katie.')).toBe('You need to follow up with Katie.')
    expect(toSecondPerson('The user is allergic to penicillin.')).toBe("You're allergic to penicillin.")
    expect(toSecondPerson('the user')).toBe('you')
  })
  it('never leaves the literal string "the user" in output', () => {
    const out = toSecondPerson('The user prefers morning meetings and the user takes coffee black.')
    expect(out.toLowerCase()).not.toContain('the user')
  })
})

describe('P1 — allergy guard (memory changes the answer)', () => {
  const mems = [{ content: 'The user is allergic to penicillin.', kind: 'fact', status: 'active' }]
  it('warns when a penicillin-class drug is prescribed and the allergy is stored', () => {
    const w = allergyGuard('the doctor wants to prescribe amoxicillin for my infection', mems)
    expect(w).toMatch(/allergic to penicillin/i)
    expect(w).toMatch(/amoxicillin/i)
  })
  it('stays silent when the allergy is not remembered', () => {
    expect(allergyGuard('the doctor wants to prescribe amoxicillin', [])).toBeNull()
  })
  it('stays silent for unrelated messages', () => {
    expect(allergyGuard('I had coffee this morning', mems)).toBeNull()
  })
  it('ignores a superseded allergy memory', () => {
    expect(allergyGuard('prescribe amoxicillin', [{ content: 'The user is allergic to penicillin.', status: 'superseded' }])).toBeNull()
  })
})
