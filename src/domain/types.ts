export type Penalty = 'none' | '+2' | 'DNF';
export type SolveMode = 'two-handed' | 'one-handed';
export type StoredSolveMode = SolveMode | null;
export interface Session { id: string; name: string; createdAt: string; mode: StoredSolveMode }
export interface Solve { id: string; sessionId: string; mode: StoredSolveMode; rawMs: number; penalty: Penalty; scramble: string; createdAt: string; note: string; source: 'timer' | 'manual' }
export type StudyStatus = 'new' | 'learning' | 'mastered';
export interface CaseProgress { caseId: string; favorite: boolean; status: StudyStatus; note: string }
export interface StudyAttempt { id: string; caseId: string; createdAt: string; recognition: 'again' | 'good'; execution: 'again' | 'good'; durationMs: number | null }
export interface Settings { theme: 'light' | 'dark' | 'system'; inspection: boolean; inspectionSound: boolean; holdMs: number; focus: boolean; hideRunningTime: boolean; animationSpeed: number }
export interface AppData { version: 3; sessions: Session[]; activeSessionId: string | null; solves: Solve[]; progress: Record<string, CaseProgress>; studyAttempts: StudyAttempt[]; settings: Settings }
export interface LegacyAppDataV1 extends Omit<AppData, 'version' | 'sessions' | 'solves' | 'activeSessionId'> { version: 1; sessions: Omit<Session, 'mode'>[]; solves: Omit<Solve, 'mode'>[]; activeSessionId: string }
export interface LegacyAppDataV2 extends Omit<LegacyAppDataV1, 'version'> { version: 2 }
export type SolveScope = { kind: 'session'; sessionId: string; mode: StoredSolveMode } | { kind: 'mode'; mode: StoredSolveMode };
export type CSVScope = SolveScope | { kind: 'all' };
export interface SolveCapture { readonly sessionId: string; readonly mode: SolveMode; readonly scramble: string }
export interface SessionClassificationPreview { sessionId: string; sessionName: string; fromMode: null; targetMode: SolveMode; solveIds: readonly string[]; solveCount: number; plus2Count: number; dnfCount: number; isActiveSession: boolean; sourceSnapshot: string }
export interface ScopedChartPoint { id: string; index: number; createdAt: string; single: number | null; ao5: number | null }
export interface ScopedChartSeries { sessionId: string; sessionName: string; mode: StoredSolveMode; points: ScopedChartPoint[] }
export interface ScopedChartResult { scope: SolveScope; mode: StoredSolveMode; series: ScopedChartSeries[] }
export type Metric = { kind: 'value'; ms: number } | { kind: 'dnf' } | { kind: 'insufficient' };
export type AverageSize = 5 | 12 | 50 | 100;
export interface Statistics { count: number; dnfCount: number; totalRawMs: number; last: Metric; best: Metric; mean: Metric; averages: Record<AverageSize, Metric>; bestAverages: Record<AverageSize, Metric> }
export interface ModeRecords { mode: SolveMode; bestSingle: Metric; bestAverages: Record<AverageSize, Metric> }
export type Face = 'U' | 'R' | 'F' | 'D' | 'L' | 'B';
export type Vector3 = readonly [number, number, number];
export interface Sticker { id: string; color: Face; position: Vector3; normal: Vector3 }
export type CubeState = readonly Sticker[];
export interface MoveInfo { token: string; axis: 0 | 1 | 2; layers: readonly number[]; quarterTurns: number }
export interface CaseMetadata { name: string; aliases: readonly string[]; nameKind: 'common' | 'descriptive'; nameSource: string }
export interface AlgorithmCase extends CaseMetadata { id: string; family: 'OLL' | 'PLL' | 'F2L' | 'CMLL'; name: string; group: string; algorithm: string; alternatives: readonly string[]; setup: string; initialState: CubeState; twoLook: boolean; source: string }
export interface Scramble { id: string; algorithm: string; state: CubeState; generatedAt: string; kind: 'random-state-333'; orientation: string }

export type PlaybackMode = 'prepare' | 'solve';
export interface AlgorithmPlayback { preparation: string; setup: string; algorithm: string; initialState: CubeState; caseState: CubeState; solution: string; mode: PlaybackMode; inverseSolution: string; usesAuthoredSetup: boolean }

export type MethodId = 'lbl' | 'cfop' | 'roux';
export type StageId =
  | 'cross' | 'f2l' | 'oll' | 'pll' | 'fb' | 'sb' | 'cmll' | 'lse'
  | 'white-cross' | 'first-corners' | 'middle-edges' | 'top-cross' | 'top-edges' | 'top-corners-position' | 'top-corners-orient';
export type ContentFamily = 'CROSS' | 'F2L' | 'OLL' | 'PLL' | 'FB' | 'SB' | 'CMLL' | 'LSE';
export interface LearningMilestone { step: number; title: string; explanation: string }
export interface ContentProvenance { title: string; url: string; author: string; license: string; notes?: string }
/** Piece names are solved identities (DFR, FR, etc.), not changing positions. */
export interface FocusPolicy { kind: 'oll-orientation' | 'last-layer' | 'pieces' | 'full'; pieces?: readonly string[]; referencePieces?: readonly string[] }
export type StageGoal = 'cross' | 'f2l-pair' | 'f2l' | 'oll' | 'pll' | 'first-block' | 'second-block' | 'cmll' | 'lse-eo' | 'lse-lr' | 'solved';
export interface ValidationSpec { goal: StageGoal; targetSlot?: 'FR' | 'FL' | 'BR' | 'BL'; preserve?: readonly string[]; referenceFrame?: 'fixed' | 'centers' }
export interface LearningDescriptor { methodId: MethodId; stageId: StageId; groupId: string; objective: string; preconditions: readonly string[]; preservation: readonly string[]; milestones: readonly LearningMilestone[]; focus: FocusPolicy; validation: ValidationSpec; provenance: readonly ContentProvenance[] }
export interface AlgorithmLearningCase extends AlgorithmCase, LearningDescriptor { kind: 'algorithm-case' }
export interface LearningExercise extends CaseMetadata, LearningDescriptor { kind: 'exercise'; id: string; family: ContentFamily; group: string; algorithm: string; alternatives: readonly string[]; setup: string; initialState: CubeState; twoLook: boolean; source: string }
export type LearningContent = AlgorithmLearningCase | LearningExercise;
export interface MethodDefinition { id: MethodId; name: string; description: string; stageIds: readonly StageId[] }
export interface StageDefinition { id: StageId; methodId: MethodId; name: string; description: string; order: number }
/** Declarative corpus contract for Trama. Main solution and setup can be partial. */
export interface ExpansionExerciseSource extends CaseMetadata, LearningDescriptor { id: string; kind: 'exercise'; family: ContentFamily; group: string; setup: string; solution: string; alternatives?: readonly string[] }
/** Reid order for the four U corners: UFR URB UBL ULF; orientations modulo 3. */
export interface CornerRecognition { pieces: readonly number[]; orientation: readonly number[] }
export interface ExpansionAlgorithmSource extends CaseMetadata { id: string; family: 'CMLL'; methodId: 'roux'; stageId: 'cmll'; groupId: string; group: string; algorithm: string; alternatives?: readonly string[]; recognition: CornerRecognition; provenance: readonly ContentProvenance[]; objective?: string; preconditions?: readonly string[]; preservation?: readonly string[]; milestones?: readonly LearningMilestone[]; focus?: FocusPolicy }
