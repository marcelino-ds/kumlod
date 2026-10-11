package domain

import "sort"

// Grade component sources.
const (
	SourceManual = "manual"
	SourceTasks  = "tasks"
)

// ValidGradeSource reports whether s is a known component source.
func ValidGradeSource(s string) bool { return s == SourceManual || s == SourceTasks }

// TargetStatus says whether a letter is still reachable.
type TargetStatus string

// Target statuses.
const (
	TargetSecured    TargetStatus = "secured"
	TargetPossible   TargetStatus = "possible"
	TargetImpossible TargetStatus = "impossible"
)

// GradeScaleEntry maps a minimum score to a letter and its grade points.
type GradeScaleEntry struct {
	Letter   string  `json:"letter"`
	MinScore float64 `json:"min_score"`
	Points   float64 `json:"points"`
}

// GradeScale is a list of entries. Use Sorted to get descending min_score order.
type GradeScale []GradeScaleEntry

// Sorted returns a copy ordered by MinScore descending.
func (s GradeScale) Sorted() GradeScale {
	out := make(GradeScale, len(s))
	copy(out, s)
	sort.SliceStable(out, func(i, j int) bool { return out[i].MinScore > out[j].MinScore })
	return out
}

// LetterFor returns the first entry (by descending min_score) whose minimum is
// met by score rounded to 2 decimals.
func (s GradeScale) LetterFor(score float64) (GradeScaleEntry, bool) {
	r := Round(score, 2)
	for _, e := range s.Sorted() {
		if r >= e.MinScore {
			return e, true
		}
	}
	return GradeScaleEntry{}, false
}

// Lookup finds the entry with the exact letter.
func (s GradeScale) Lookup(letter string) (GradeScaleEntry, bool) {
	for _, e := range s {
		if e.Letter == letter {
			return e, true
		}
	}
	return GradeScaleEntry{}, false
}

// GradeComponentInput is a component with the data needed to compute its score.
type GradeComponentInput struct {
	ID         string
	Weight     float64
	Source     string
	Score      *float64  // manual score
	TaskScores []float64 // scores of graded tasks linked to the component
}

// GradeComponentResult is the computed state of one component.
type GradeComponentResult struct {
	ID              string
	EffectiveScore  *float64 // rounded to 2 decimals
	GradedTaskCount int
}

// GradeTarget is the average needed on the remaining components to reach a letter.
type GradeTarget struct {
	Letter          string
	MinScore        float64
	RequiredAverage *float64 // nil when every component already has a score
	Status          TargetStatus
}

// GradeSummary is the computed grade of a course.
type GradeSummary struct {
	Components   []GradeComponentResult
	TotalWeight  float64
	KnownWeight  float64
	CurrentScore *float64
	FinalScore   *float64
	Letter       *string
	IsFinal      bool
	Targets      []GradeTarget
}

// effectiveScore returns the unrounded effective score of a component.
func effectiveScore(c GradeComponentInput) (*float64, int) {
	if c.Source == SourceTasks {
		if len(c.TaskScores) == 0 {
			return nil, 0
		}
		sum := 0.0
		for _, s := range c.TaskScores {
			sum += s
		}
		avg := sum / float64(len(c.TaskScores))
		return &avg, len(c.TaskScores)
	}
	if c.Score == nil {
		return nil, 0
	}
	v := *c.Score
	return &v, 0
}

// SummarizeGrades computes current and final scores, the letter, and targets per letter.
// Weights that do not add up to 100 are used proportionally.
func SummarizeGrades(components []GradeComponentInput, scale GradeScale) GradeSummary {
	sorted := scale.Sorted()
	sum := GradeSummary{Components: make([]GradeComponentResult, 0, len(components))}

	knownPoints := 0.0
	remaining := 0.0
	for _, c := range components {
		eff, n := effectiveScore(c)
		sum.TotalWeight += c.Weight
		if eff != nil {
			sum.KnownWeight += c.Weight
			knownPoints += c.Weight * *eff
		} else {
			remaining += c.Weight
		}
		sum.Components = append(sum.Components, GradeComponentResult{
			ID:              c.ID,
			EffectiveScore:  RoundPtr(eff, 2),
			GradedTaskCount: n,
		})
	}

	if sum.KnownWeight > 0 {
		cur := knownPoints / sum.KnownWeight
		sum.CurrentScore = &cur
	}
	sum.IsFinal = len(components) > 0 && remaining == 0
	if sum.IsFinal && sum.TotalWeight > 0 {
		f := knownPoints / sum.TotalWeight
		sum.FinalScore = &f
	}

	letterScore := sum.CurrentScore
	if sum.IsFinal {
		letterScore = sum.FinalScore
	}
	if letterScore != nil {
		if e, ok := sorted.LetterFor(*letterScore); ok {
			l := e.Letter
			sum.Letter = &l
		}
	}

	sum.Targets = []GradeTarget{}
	if len(components) > 0 && sum.TotalWeight > 0 {
		for _, e := range sorted {
			t := GradeTarget{Letter: e.Letter, MinScore: e.MinScore}
			if remaining == 0 {
				if sum.FinalScore != nil && Round(*sum.FinalScore, 2) >= e.MinScore {
					t.Status = TargetSecured
				} else {
					t.Status = TargetImpossible
				}
			} else {
				req := (e.MinScore*sum.TotalWeight - knownPoints) / remaining
				switch {
				case req <= 1e-9:
					t.Status = TargetSecured
				case req <= 100+1e-9:
					t.Status = TargetPossible
				default:
					t.Status = TargetImpossible
				}
				if req < 0 {
					req = 0
				}
				r := CeilTo(req, 2)
				t.RequiredAverage = &r
			}
			sum.Targets = append(sum.Targets, t)
		}
	}

	sum.CurrentScore = RoundPtr(sum.CurrentScore, 2)
	sum.FinalScore = RoundPtr(sum.FinalScore, 2)
	sum.TotalWeight = Round(sum.TotalWeight, 2)
	sum.KnownWeight = Round(sum.KnownWeight, 2)
	return sum
}

// DefaultComponent is one entry of the template used when a course is created
// without grade components.
type DefaultComponent struct {
	Name   string
	Weight float64
	Source string
}

// DefaultGradeComponents returns Tugas 30% (from tasks), UTS 30%, UAS 40%.
func DefaultGradeComponents() []DefaultComponent {
	return []DefaultComponent{
		{Name: "Tugas", Weight: 30, Source: SourceTasks},
		{Name: "UTS", Weight: 30, Source: SourceManual},
		{Name: "UAS", Weight: 40, Source: SourceManual},
	}
}
