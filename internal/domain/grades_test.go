package domain

import (
	"testing"
)

func fp(v float64) *float64 { return &v }
func sp(v string) *string   { return &v }

func TestGradeScaleLetterFor(t *testing.T) {
	scale := DefaultGradeScale()
	tests := []struct {
		score float64
		want  string
	}{
		{100, "A"},
		{85, "A"},
		{84.999, "A"}, // rounds to 85.00
		{84.99, "A-"},
		{70, "B"},
		{39.99, "E"},
		{0, "E"},
	}
	for _, tt := range tests {
		e, ok := scale.LetterFor(tt.score)
		if !ok || e.Letter != tt.want {
			t.Errorf("LetterFor(%v) = %q, %v; want %q", tt.score, e.Letter, ok, tt.want)
		}
	}
	// Order of the stored scale must not matter.
	reversed := GradeScale{}
	for i := len(scale) - 1; i >= 0; i-- {
		reversed = append(reversed, scale[i])
	}
	if e, _ := reversed.LetterFor(90); e.Letter != "A" {
		t.Errorf("unsorted scale: got %q want A", e.Letter)
	}
	if _, ok := (GradeScale{{Letter: "A", MinScore: 50, Points: 4}}).LetterFor(10); ok {
		t.Errorf("score below every minimum should not have a letter")
	}
}

func TestSummarizeGrades(t *testing.T) {
	scale := DefaultGradeScale()
	tests := []struct {
		name       string
		components []GradeComponentInput
		check      func(t *testing.T, s GradeSummary)
	}{
		{
			name:       "no components",
			components: nil,
			check: func(t *testing.T, s GradeSummary) {
				if s.CurrentScore != nil || s.FinalScore != nil || s.Letter != nil || s.IsFinal {
					t.Errorf("expected empty summary, got %+v", s)
				}
				if len(s.Targets) != 0 {
					t.Errorf("expected no targets, got %d", len(s.Targets))
				}
			},
		},
		{
			name: "nothing graded yet",
			components: []GradeComponentInput{
				{ID: "t", Weight: 30, Source: SourceTasks},
				{ID: "m", Weight: 30, Source: SourceManual},
				{ID: "f", Weight: 40, Source: SourceManual},
			},
			check: func(t *testing.T, s GradeSummary) {
				if s.CurrentScore != nil || s.Letter != nil || s.IsFinal {
					t.Errorf("unexpected scores: %+v", s)
				}
				if s.TotalWeight != 100 || s.KnownWeight != 0 {
					t.Errorf("weights: %v %v", s.TotalWeight, s.KnownWeight)
				}
				a := s.Targets[0]
				if a.Letter != "A" || a.Status != TargetPossible || *a.RequiredAverage != 85 {
					t.Errorf("target A: %+v %v", a, *a.RequiredAverage)
				}
				e := s.Targets[len(s.Targets)-1]
				if e.Letter != "E" || e.Status != TargetSecured || *e.RequiredAverage != 0 {
					t.Errorf("target E: %+v", e)
				}
			},
		},
		{
			name: "partial grades give current score and targets",
			components: []GradeComponentInput{
				{ID: "t", Weight: 30, Source: SourceTasks, TaskScores: []float64{80, 90}},
				{ID: "m", Weight: 30, Source: SourceManual, Score: fp(70)},
				{ID: "f", Weight: 40, Source: SourceManual},
			},
			check: func(t *testing.T, s GradeSummary) {
				// tasks avg 85 -> 30*85 + 30*70 = 4650 over 60 = 77.5
				if s.CurrentScore == nil || *s.CurrentScore != 77.5 {
					t.Fatalf("current = %v", deref(s.CurrentScore))
				}
				if *s.Letter != "B+" || s.IsFinal || s.FinalScore != nil {
					t.Errorf("letter %v final %v", *s.Letter, s.IsFinal)
				}
				if s.Components[0].GradedTaskCount != 2 || *s.Components[0].EffectiveScore != 85 {
					t.Errorf("tasks component: %+v", s.Components[0])
				}
				// A needs (85*100 - 4650)/40 = 96.25
				if s.Targets[0].Letter != "A" || *s.Targets[0].RequiredAverage != 96.25 || s.Targets[0].Status != TargetPossible {
					t.Errorf("target A: %+v", s.Targets[0])
				}
				// D needs (40*100-4650)/40 < 0 -> secured
				d := findTarget(s, "D")
				if d.Status != TargetSecured || *d.RequiredAverage != 0 {
					t.Errorf("target D: %+v", d)
				}
			},
		},
		{
			name: "impossible target",
			components: []GradeComponentInput{
				{ID: "m", Weight: 60, Source: SourceManual, Score: fp(40)},
				{ID: "f", Weight: 40, Source: SourceManual},
			},
			check: func(t *testing.T, s GradeSummary) {
				// A needs (8500-2400)/40 = 152.5
				a := s.Targets[0]
				if a.Status != TargetImpossible || *a.RequiredAverage != 152.5 {
					t.Errorf("target A: %+v %v", a, *a.RequiredAverage)
				}
			},
		},
		{
			name: "all graded is final",
			components: []GradeComponentInput{
				{ID: "t", Weight: 30, Source: SourceTasks, TaskScores: []float64{90}},
				{ID: "m", Weight: 30, Source: SourceManual, Score: fp(80)},
				{ID: "f", Weight: 40, Source: SourceManual, Score: fp(85)},
			},
			check: func(t *testing.T, s GradeSummary) {
				// 2700 + 2400 + 3400 = 8500 / 100 = 85
				if !s.IsFinal || *s.FinalScore != 85 || *s.Letter != "A" {
					t.Errorf("final: %+v %v %v", s.IsFinal, deref(s.FinalScore), *s.Letter)
				}
				if s.Targets[0].Status != TargetSecured || s.Targets[0].RequiredAverage != nil {
					t.Errorf("target A: %+v", s.Targets[0])
				}
				if findTarget(s, "E").Status != TargetSecured {
					t.Errorf("target E should be secured")
				}
			},
		},
		{
			name: "final below a letter is impossible for that letter",
			components: []GradeComponentInput{
				{ID: "m", Weight: 50, Source: SourceManual, Score: fp(70)},
				{ID: "f", Weight: 50, Source: SourceManual, Score: fp(70)},
			},
			check: func(t *testing.T, s GradeSummary) {
				if s.Targets[0].Status != TargetImpossible || findTarget(s, "B").Status != TargetSecured {
					t.Errorf("targets: %+v", s.Targets)
				}
			},
		},
		{
			name: "weights not adding to 100 are proportional",
			components: []GradeComponentInput{
				{ID: "m", Weight: 20, Source: SourceManual, Score: fp(100)},
				{ID: "f", Weight: 30, Source: SourceManual, Score: fp(50)},
			},
			check: func(t *testing.T, s GradeSummary) {
				// (2000 + 1500) / 50 = 70
				if s.TotalWeight != 50 || !s.IsFinal || *s.FinalScore != 70 || *s.Letter != "B" {
					t.Errorf("summary: %+v %v", s, deref(s.FinalScore))
				}
			},
		},
		{
			name: "tasks component without graded tasks has no score",
			components: []GradeComponentInput{
				{ID: "t", Weight: 50, Source: SourceTasks, Score: fp(100)},
				{ID: "m", Weight: 50, Source: SourceManual, Score: fp(60)},
			},
			check: func(t *testing.T, s GradeSummary) {
				if s.Components[0].EffectiveScore != nil || s.IsFinal || *s.CurrentScore != 60 {
					t.Errorf("summary: %+v", s)
				}
			},
		},
		{
			name: "required average rounds up to 2 decimals",
			components: []GradeComponentInput{
				{ID: "a", Weight: 70, Source: SourceManual, Score: fp(80)},
				{ID: "b", Weight: 30, Source: SourceManual},
			},
			check: func(t *testing.T, s GradeSummary) {
				// A: (8500 - 5600) / 30 = 96.666.. -> 96.67
				if got := *s.Targets[0].RequiredAverage; got != 96.67 {
					t.Errorf("required = %v", got)
				}
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.check(t, SummarizeGrades(tt.components, scale))
		})
	}
}

func findTarget(s GradeSummary, letter string) GradeTarget {
	for _, t := range s.Targets {
		if t.Letter == letter {
			return t
		}
	}
	return GradeTarget{}
}

func TestComputeSemesterGPA(t *testing.T) {
	scale := DefaultGradeScale()
	tests := []struct {
		name      string
		courses   []GPACourse
		wantIPS   *float64
		wantCred  int
		wantGrad  int
		projected bool
	}{
		{name: "empty", courses: nil, wantIPS: nil},
		{
			name: "official letters only",
			courses: []GPACourse{
				{Credits: 3, OfficialLetter: sp("A")},
				{Credits: 2, OfficialLetter: sp("B")},
			},
			// (12 + 6) / 5 = 3.6
			wantIPS: fp(3.6), wantCred: 5, wantGrad: 5,
		},
		{
			name: "official wins over computed and computed marks projection",
			courses: []GPACourse{
				{Credits: 3, OfficialLetter: sp("A"), ComputedLetter: sp("C")},
				{Credits: 3, ComputedLetter: sp("B+")},
				{Credits: 2},
			},
			// (12 + 9.9) / 6 = 3.65
			wantIPS: fp(3.65), wantCred: 8, wantGrad: 6, projected: true,
		},
		{
			name: "official letter outside the scale falls back to computed",
			courses: []GPACourse{
				{Credits: 4, OfficialLetter: sp("Z"), ComputedLetter: sp("B")},
			},
			wantIPS: fp(3), wantCred: 4, wantGrad: 4, projected: true,
		},
		{
			name:    "zero credit course does not break division",
			courses: []GPACourse{{Credits: 0, OfficialLetter: sp("A")}},
			wantIPS: nil,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ComputeSemesterGPA(tt.courses, scale)
			if !equalPtr(got.IPS, tt.wantIPS) || got.Credits != tt.wantCred || got.GradedCredits != tt.wantGrad || got.IsProjected != tt.projected {
				t.Errorf("got %+v ips=%v", got, deref(got.IPS))
			}
		})
	}
}

func TestComputeCumulativeGPA(t *testing.T) {
	sems := []SemesterGPA{
		{Credits: 20, GradedCredits: 20, Points: 70},             // 3.5
		{Credits: 20, GradedCredits: 10, Points: 30, IsProjected: true}, // 3.0
	}
	tests := []struct {
		name     string
		baseline Baseline
		wantIPK  *float64
		wantCred int
	}{
		{"without baseline", Baseline{}, fp(3.33), 30}, // 100/30
		{"with baseline", Baseline{GPA: fp(3.0), Credits: 40}, fp(3.14), 70}, // 220/70
		{"baseline without gpa is ignored", Baseline{Credits: 40}, fp(3.33), 30},
		{"baseline with zero credits is ignored", Baseline{GPA: fp(4)}, fp(3.33), 30},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ComputeCumulativeGPA(sems, tt.baseline)
			if !equalPtr(got.IPK, tt.wantIPK) || got.TotalGradedCredits != tt.wantCred || !got.IsProjected {
				t.Errorf("got %+v ipk=%v", got, deref(got.IPK))
			}
		})
	}
	if got := ComputeCumulativeGPA(nil, Baseline{}); got.IPK != nil || got.TotalGradedCredits != 0 {
		t.Errorf("empty: %+v", got)
	}
}

func TestSimulateTarget(t *testing.T) {
	prev := []SemesterGPA{{Credits: 20, GradedCredits: 20, Points: 60}} // IPS 3.0
	tests := []struct {
		name     string
		target   float64
		active   *SemesterGPA
		others   []SemesterGPA
		baseline Baseline
		status   SimulationStatus
		required *float64
	}{
		{"no active semester", 3.5, nil, prev, Baseline{}, SimulationNoCredits, nil},
		{"active without credits", 3.5, &SemesterGPA{}, prev, Baseline{}, SimulationNoCredits, nil},
		// (3.5*40 - 60)/20 = 4.0
		{"possible at the edge", 3.5, &SemesterGPA{Credits: 20}, prev, Baseline{}, SimulationPossible, fp(4)},
		// (3.25*40 - 60)/20 = 3.5
		{"possible", 3.25, &SemesterGPA{Credits: 20}, prev, Baseline{}, SimulationPossible, fp(3.5)},
		// (3.6*40 - 60)/20 = 4.2
		{"impossible", 3.6, &SemesterGPA{Credits: 20}, prev, Baseline{}, SimulationImpossible, fp(4.2)},
		// (1.0*40 - 60)/20 < 0
		{"secured", 1.0, &SemesterGPA{Credits: 20}, prev, Baseline{}, SimulationSecured, fp(0)},
		// baseline 3.0 x 40 = 120, prev 60/20 -> (3.2*80 - 180)/20 = 3.8
		{"with baseline", 3.2, &SemesterGPA{Credits: 20}, prev, Baseline{GPA: fp(3), Credits: 40}, SimulationPossible, fp(3.8)},
		// no history: target equals required
		{"first semester", 3.33, &SemesterGPA{Credits: 21}, nil, Baseline{}, SimulationPossible, fp(3.33)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := SimulateTarget(tt.target, tt.active, tt.others, tt.baseline)
			if got.Status != tt.status || !equalPtr(got.RequiredIPS, tt.required) || got.TargetIPK != tt.target {
				t.Errorf("got %+v required=%v", got, deref(got.RequiredIPS))
			}
		})
	}
}

func equalPtr(a, b *float64) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}
