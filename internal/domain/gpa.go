package domain

// Baseline is the GPA and credits earned before using Kumlod.
type Baseline struct {
	GPA     *float64 `json:"gpa"`
	Credits int      `json:"credits"`
}

// used reports whether the baseline should count toward the cumulative GPA.
func (b Baseline) used() bool { return b.GPA != nil && b.Credits > 0 }

// GPACourse is the grade information of one course for GPA purposes.
type GPACourse struct {
	Credits        int
	OfficialLetter *string // letter from the transcript (KHS)
	ComputedLetter *string // letter computed from the components
}

// SemesterGPA is the computed GPA (IPS) of a semester.
type SemesterGPA struct {
	Credits       int     // all credits in the semester
	GradedCredits int     // credits of courses that have a letter
	Points        float64 // sum of grade points x credits for graded courses
	IPS           *float64
	IsProjected   bool // true when any graded course uses a computed letter
}

// ComputeSemesterGPA computes the IPS. An official letter wins over the computed
// one when it exists in the scale.
func ComputeSemesterGPA(courses []GPACourse, scale GradeScale) SemesterGPA {
	var s SemesterGPA
	for _, c := range courses {
		s.Credits += c.Credits
		var entry GradeScaleEntry
		found := false
		projected := false
		if c.OfficialLetter != nil {
			entry, found = scale.Lookup(*c.OfficialLetter)
		}
		if !found && c.ComputedLetter != nil {
			entry, found = scale.Lookup(*c.ComputedLetter)
			projected = found
		}
		if !found {
			continue
		}
		s.GradedCredits += c.Credits
		s.Points += entry.Points * float64(c.Credits)
		if projected {
			s.IsProjected = true
		}
	}
	if s.GradedCredits > 0 {
		ips := Round(s.Points/float64(s.GradedCredits), 2)
		s.IPS = &ips
	}
	return s
}

// CumulativeGPA is the IPK over all semesters plus the optional baseline.
type CumulativeGPA struct {
	IPK                *float64
	TotalGradedCredits int // includes baseline credits
	IsProjected        bool
}

// ComputeCumulativeGPA combines semesters and the baseline into the IPK.
func ComputeCumulativeGPA(semesters []SemesterGPA, baseline Baseline) CumulativeGPA {
	var out CumulativeGPA
	points := 0.0
	credits := 0
	if baseline.used() {
		points += *baseline.GPA * float64(baseline.Credits)
		credits += baseline.Credits
	}
	for _, s := range semesters {
		points += s.Points
		credits += s.GradedCredits
		if s.IsProjected {
			out.IsProjected = true
		}
	}
	out.TotalGradedCredits = credits
	if credits > 0 {
		ipk := Round(points/float64(credits), 2)
		out.IPK = &ipk
	}
	return out
}

// SimulationStatus is the outcome of a target GPA simulation.
type SimulationStatus string

// Simulation statuses.
const (
	SimulationSecured    SimulationStatus = "secured"
	SimulationPossible   SimulationStatus = "possible"
	SimulationImpossible SimulationStatus = "impossible"
	SimulationNoCredits  SimulationStatus = "no_credits"
)

// GPASimulation is the IPS needed this semester to reach a target IPK.
type GPASimulation struct {
	TargetIPK   float64
	RequiredIPS *float64
	Status      SimulationStatus
}

// SimulateTarget computes the minimum IPS needed in the active semester.
// active is nil when there is no active semester; others are all other semesters.
func SimulateTarget(target float64, active *SemesterGPA, others []SemesterGPA, baseline Baseline) GPASimulation {
	out := GPASimulation{TargetIPK: target}
	if active == nil || active.Credits == 0 {
		out.Status = SimulationNoCredits
		return out
	}
	prevPoints := 0.0
	prevCredits := 0
	if baseline.used() {
		prevPoints += *baseline.GPA * float64(baseline.Credits)
		prevCredits += baseline.Credits
	}
	for _, s := range others {
		prevPoints += s.Points
		prevCredits += s.GradedCredits
	}
	cur := float64(active.Credits)
	req := (target*(float64(prevCredits)+cur) - prevPoints) / cur

	switch {
	case req <= 1e-9:
		out.Status = SimulationSecured
		zero := 0.0
		out.RequiredIPS = &zero
	case req <= 4+1e-9:
		out.Status = SimulationPossible
		r := CeilTo(req, 2)
		if r > 4 {
			r = 4
		}
		out.RequiredIPS = &r
	default:
		out.Status = SimulationImpossible
		r := CeilTo(req, 2)
		out.RequiredIPS = &r
	}
	return out
}
