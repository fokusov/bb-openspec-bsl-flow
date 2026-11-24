# BSL Flow progress

## Purpose

Show BSL Flow change progress and review evidence alongside the corresponding OpenSpec change and linked thread.

## Requirements

### Requirement: BSL Flow change presentation

The Changes panel SHALL display the specification, review, implementation and verification stages for a change that resolves to the BSL Flow schema. Review status SHALL also appear in the change list.

#### Scenario: BSL Flow change without tasks

- **WHEN** the effective change schema is `bsl-flow` and `spec.md` exists
- **THEN** the detail panel opens the root specification and shows the review state without requiring `tasks.md`

#### Scenario: Same change ID in different environments

- **WHEN** planning roots in two environments contain different evidence for the same change ID
- **THEN** each change presentation reflects its selected planning root and code environment

#### Scenario: Two worktrees share an OpenSpec store

- **WHEN** worktrees with different review policies use the same store and change ID
- **THEN** each view uses its worktree's `bsl-flow.yaml` and refreshes when that file changes

### Requirement: Evidence-based review status

The panel SHALL show a confirmed review only when a supported final-validation receipt matches the current specification and referenced artifacts. Available report files SHALL be accessible for inspection.

#### Scenario: Specification changed after review

- **WHEN** the specification no longer matches the receipt digest
- **THEN** the review is marked outdated and the available receipt remains accessible

#### Scenario: Project test report is unbound

- **WHEN** the code workspace has a test report with no supported binding to the change
- **THEN** the report is presented as project-level context while change verification remains unconfirmed

#### Scenario: A change has a verification report or review waiver

- **WHEN** `verification.md` or `review-waiver.md` exists in the selected change
- **THEN** the corresponding document opens from the change card, and document presence alone does not change review or verification status

### Requirement: Standard OpenSpec compatibility

The fork SHALL retain the upstream checklist, specification browser and planning source selection for standard OpenSpec changes.

#### Scenario: Standard change uses a task checklist

- **WHEN** the effective schema is `spec-driven`
- **THEN** checklist progress is calculated from `tasks.md` using the standard presentation
