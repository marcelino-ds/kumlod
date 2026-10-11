package httpapi

import (
	"math"
	"net/http"

	"kumlod/internal/api"
	"kumlod/internal/domain"
	"kumlod/internal/store"
)

// GetGpa returns the IPS per semester, the IPK, and an optional target simulation.
func (s *Server) GetGpa(w http.ResponseWriter, r *http.Request, params api.GetGpaParams) {
	if t := params.TargetIpk; t != nil && (math.IsNaN(*t) || *t < 0 || *t > 4) {
		s.fail(w, r, domain.Invalid("target_ipk", "Target IPK harus 0-4"))
		return
	}
	ctx := r.Context()
	semesters, err := s.store.ListSemesters(ctx)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	courses, err := s.store.ListCourses(ctx, "")
	if err != nil {
		s.fail(w, r, err)
		return
	}
	d, err := s.loadCourseData(ctx, "")
	if err != nil {
		s.fail(w, r, err)
		return
	}
	scale := d.settings.GradeScale

	bySemester := map[string][]store.Course{}
	for _, c := range courses {
		bySemester[c.SemesterID] = append(bySemester[c.SemesterID], c)
	}

	out := api.GpaSummary{Semesters: make([]api.GpaSemester, 0, len(semesters)), Baseline: toBaseline(d.settings.Baseline)}
	all := make([]domain.SemesterGPA, 0, len(semesters))
	var active *domain.SemesterGPA
	var others []domain.SemesterGPA
	for _, sem := range semesters {
		var gc []domain.GPACourse
		for _, c := range bySemester[sem.ID] {
			gc = append(gc, domain.GPACourse{
				Credits:        c.Credits,
				OfficialLetter: c.FinalGradeLetter,
				ComputedLetter: d.grade(c).Letter,
			})
		}
		g := domain.ComputeSemesterGPA(gc, scale)
		all = append(all, g)
		if sem.IsActive {
			ga := g
			active = &ga
		} else {
			others = append(others, g)
		}
		out.Semesters = append(out.Semesters, api.GpaSemester{
			SemesterId:    sem.ID,
			Name:          sem.Name,
			IsActive:      sem.IsActive,
			Credits:       g.Credits,
			GradedCredits: g.GradedCredits,
			Ips:           g.IPS,
			IsProjected:   g.IsProjected,
		})
	}
	cum := domain.ComputeCumulativeGPA(all, d.settings.Baseline)
	out.Ipk = cum.IPK
	out.TotalGradedCredits = cum.TotalGradedCredits
	out.IsProjected = cum.IsProjected

	if params.TargetIpk != nil {
		sim := domain.SimulateTarget(*params.TargetIpk, active, others, d.settings.Baseline)
		out.Simulation = &api.GpaSimulation{
			TargetIpk:   sim.TargetIPK,
			RequiredIps: sim.RequiredIPS,
			Status:      api.GpaSimulationStatus(sim.Status),
		}
	}
	writeJSON(w, http.StatusOK, out)
}
