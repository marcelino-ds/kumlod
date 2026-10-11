package domain

import (
	"errors"
	"sort"
)

// ScheduleSlot is a weekly class slot.
type ScheduleSlot struct {
	DayOfWeek int // ISO: 1 = Monday ... 7 = Sunday
	StartTime string
	EndTime   string
	Room      string
}

// PlannedMeeting is a meeting produced by GenerateMeetings.
type PlannedMeeting struct {
	Number    int
	Date      string
	StartTime string
	EndTime   string
	Room      string
	Kind      string
}

// MaxGenerateDays bounds how far GenerateMeetings looks ahead.
const MaxGenerateDays = 400

// GenerateMeetings creates total meetings starting at startDate, following all
// slots in chronological order. With 4 or more meetings, meeting total/2 becomes
// the midterm and the last one the final exam.
func GenerateMeetings(startDate string, slots []ScheduleSlot, total int) ([]PlannedMeeting, error) {
	if len(slots) == 0 {
		return nil, errors.New("matkul belum punya jadwal")
	}
	if total < 1 {
		return nil, errors.New("jumlah pertemuan minimal 1")
	}
	day, err := ParseDate(startDate)
	if err != nil {
		return nil, err
	}

	byDay := map[int][]ScheduleSlot{}
	for _, s := range slots {
		byDay[s.DayOfWeek] = append(byDay[s.DayOfWeek], s)
	}
	for d := range byDay {
		list := byDay[d]
		sort.SliceStable(list, func(i, j int) bool { return list[i].StartTime < list[j].StartTime })
	}

	out := make([]PlannedMeeting, 0, total)
	for i := 0; i < MaxGenerateDays && len(out) < total; i++ {
		for _, s := range byDay[ISOWeekday(day)] {
			if len(out) == total {
				break
			}
			out = append(out, PlannedMeeting{
				Number:    len(out) + 1,
				Date:      day.Format(DateLayout),
				StartTime: s.StartTime,
				EndTime:   s.EndTime,
				Room:      s.Room,
				Kind:      KindLecture,
			})
		}
		day = day.AddDate(0, 0, 1)
	}

	n := len(out)
	if n >= 4 {
		out[n/2-1].Kind = KindMidterm
		out[n-1].Kind = KindFinal
	}
	return out, nil
}
