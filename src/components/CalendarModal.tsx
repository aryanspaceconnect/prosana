import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icon } from '@iconify/react';
import { UserProfile, CalendarEventItem } from '../types';
import { addCalendarEvent, deleteCalendarEvent, subscribeCalendarEvents } from '../lib/firebase';

interface CalendarModalProps {
  userProfile: UserProfile | null;
  onOpenScan: () => void;
}

export const CalendarModal: React.FC<CalendarModalProps> = ({ userProfile, onOpenScan }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<number>(new Date().getDate());
  const [events, setEvents] = useState<CalendarEventItem[]>([]);
  
  // New event form states
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventCategory, setNewEventCategory] = useState<'routine' | 'scan' | 'treatment' | 'habit' | 'wellness'>('routine');
  const [newEventTime, setNewEventTime] = useState('20:00');
  const [newEventNotes, setNewEventNotes] = useState('');
  const [newEventReminder, setNewEventReminder] = useState(true);
  const [isFormExpanded, setIsFormExpanded] = useState(false);

  const daysOfWeek = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

  // Subscribe to calendar events in Firestore for logged in user or guest user
  useEffect(() => {
    const uid = userProfile?.uid || 'guest_user';
    const unsub = subscribeCalendarEvents(uid, (data) => {
      setEvents(data);
    });
    return () => unsub();
  }, [userProfile?.uid]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-indexed

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Helper to generate calendar days for current month
  const getDaysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
  const getFirstDayOffset = (y: number, m: number) => {
    const day = new Date(y, m, 1).getDay(); // 0=Sun, 1=Mon...
    return day === 0 ? 6 : day - 1; // Convert to Mon=0
  };

  const totalDays = getDaysInMonth(year, month);
  const offset = getFirstDayOffset(year, month);
  const prevMonthTotal = getDaysInMonth(year, month - 1);

  const prevMonthDays = Array.from({ length: offset }, (_, i) => prevMonthTotal - offset + 1 + i);
  const currentMonthDays = Array.from({ length: totalDays }, (_, i) => i + 1);

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventTitle.trim()) return;

    const formattedMonth = String(month + 1).padStart(2, '0');
    const formattedDay = String(selectedDate).padStart(2, '0');
    const dateStr = `${year}-${formattedMonth}-${formattedDay}`;

    const uid = userProfile?.uid || 'guest_user';
    await addCalendarEvent(uid, {
      title: newEventTitle.trim(),
      date: dateStr,
      time: newEventTime,
      category: newEventCategory,
      notes: newEventNotes.trim() || undefined,
      reminder: newEventReminder
    });

    setNewEventTitle('');
    setNewEventNotes('');
    setIsFormExpanded(false);
  };

  const handleDeleteEvent = async (eventId: string) => {
    await deleteCalendarEvent(eventId);
  };

  const selectedDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(selectedDate).padStart(2, '0')}`;
  const todaysEvents = events.filter(e => e.date === selectedDateStr);

  const getCategoryBadgeClass = (_category: string) => {
    return 'text-slate-500 font-medium text-[11px] tracking-tight';
  };

  return (
    <div className="w-full h-full px-5 pt-2 pb-24 overflow-y-auto no-scrollbar space-y-5">
      {/* Top Header */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <h2 className="text-[22px] font-bold text-[#121316] tracking-tight">
            {monthNames[month]} <span className="text-[#8e95a2] font-normal">{year}</span>
          </h2>
          <p className="text-[12px] text-[#787f8d]">Regimen Schedule & Health Calendar</p>
        </div>

        <div className="flex items-center space-x-1.5">
          <button
            onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
            className="p-2 rounded-xl bg-white border border-[#eaedf1] text-[#121316] hover:bg-[#f0f3f6] transition-colors cursor-pointer"
          >
            <Icon icon="solar:alt-arrow-left-linear" className="w-4 h-4" />
          </button>
          <button
            onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
            className="p-2 rounded-xl bg-white border border-[#eaedf1] text-[#121316] hover:bg-[#f0f3f6] transition-colors cursor-pointer"
          >
            <Icon icon="solar:alt-arrow-right-linear" className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Calendar Grid Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="squircle-card p-5 shadow-lg border border-white/90 bg-white/95"
      >
        {/* Days of week header */}
        <div className="grid grid-cols-7 gap-1 text-center mb-3">
          {daysOfWeek.map((d, i) => (
            <span key={i} className="text-[13px] font-semibold text-[#8a919e]">
              {d}
            </span>
          ))}
        </div>

        {/* Days Grid */}
        <div className="grid grid-cols-7 gap-1 text-center">
          {/* Previous Month Inactive Slots (Empty spacers to preserve alignment without cluttering previous month numbers) */}
          {prevMonthDays.map((_, i) => (
            <div key={`prev-${i}`} className="py-2.5 h-10" />
          ))}

          {/* Current Month Days */}
          {currentMonthDays.map((day) => {
            const isSelected = day === selectedDate;
            const isToday = day === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear();
            const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const hasEvents = events.some(e => e.date === dateKey);

            return (
              <button
                key={`curr-${day}`}
                onClick={() => setSelectedDate(day)}
                className={`relative h-10 rounded-2xl text-[13.5px] font-semibold transition-all cursor-pointer flex flex-col items-center justify-center ${
                  isSelected
                    ? 'bg-[#2563eb] text-white shadow-md font-bold'
                    : isToday
                    ? 'bg-[#eff6ff] text-[#2563eb] border border-[#bfdbfe] font-bold'
                    : 'text-[#334155] hover:bg-[#f1f5f9]'
                }`}
              >
                <span>{day}</span>
                {/* Indicator dot if events exist */}
                {hasEvents && (
                  <span className={`w-1.5 h-1.5 rounded-full mt-0.5 ${isSelected ? 'bg-white' : 'bg-[#2563eb]'}`} />
                )}
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* Scheduled Events & Regimen Logs for Selected Date */}
      <div className="squircle-card p-4 sm:p-5 space-y-3.5 bg-white border border-[#eaedf1] shadow-xs">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[15px] font-bold text-[#121316]">
              Schedule for {monthNames[month]} {selectedDate}
            </h3>
            <p className="text-[11.5px] text-[#787f8d] font-medium">
              {todaysEvents.length} {todaysEvents.length === 1 ? 'event' : 'events'} planned
            </p>
          </div>
        </div>

        {todaysEvents.length === 0 ? (
          <div className="p-3.5 rounded-2xl bg-[#f8f9fb] text-center border border-[#eaedf1]">
            <Icon icon="solar:calendar-minimalistic-linear" className="w-5 h-5 text-[#94a3b8] mx-auto mb-1" />
            <p className="text-[12.5px] text-[#64748b] font-medium">No events scheduled for this date.</p>
            <p className="text-[11px] text-[#94a3b8] mt-0.5">Tap below to log a regimen or skin check reminder.</p>
          </div>
        ) : (
          <div className="space-y-1 divide-y divide-slate-100">
            {todaysEvents.map(evt => (
              <div
                key={evt.id}
                className="py-2.5 px-1 hover:bg-slate-50/80 transition-all flex flex-col space-y-1 relative group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-[11.5px] font-semibold text-slate-700 font-mono flex items-center gap-1">
                      <Icon icon="solar:clock-circle-bold" className="w-3.5 h-3.5 text-blue-500" />
                      {evt.time || '20:00'}
                    </span>
                    <span className="text-[13.5px] font-semibold text-[#121316]">{evt.title}</span>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className={`capitalize ${getCategoryBadgeClass(evt.category)}`}>
                      {evt.category}
                    </span>

                    <button
                      onClick={() => handleDeleteEvent(evt.id)}
                      className="text-[#94a3b8] hover:text-red-500 transition-colors p-1 rounded-lg hover:bg-red-50 cursor-pointer"
                      title="Delete event"
                    >
                      <Icon icon="solar:trash-bin-trash-linear" className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {evt.notes && (
                  <p className="text-[12px] text-[#475569] leading-relaxed pl-5">
                    {evt.notes}
                  </p>
                )}

                {evt.reminder && (
                  <div className="flex items-center space-x-1 text-[11px] text-slate-500 font-medium pt-0.5 pl-5">
                    <Icon icon="solar:bell-bing-bold" className="w-3 h-3 text-blue-500" />
                    <span>Reminder Active</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add Event Form */}
        <div className="pt-2 border-t border-[#f1f5f9]">
          {!isFormExpanded ? (
            <button
              onClick={() => setIsFormExpanded(true)}
              className="w-full py-2.5 px-3.5 rounded-2xl bg-[#f8f9fb] hover:bg-[#f1f5f9] border border-[#eaedf1] text-[13px] text-[#475569] font-medium flex items-center justify-between transition-colors cursor-pointer"
            >
              <span className="flex items-center space-x-2">
                <Icon icon="solar:add-circle-bold" className="w-4 h-4 text-[#2563eb]" />
                <span>Add new event, reminder or skin note...</span>
              </span>
              <span className="text-[11px] text-[#2563eb] font-semibold">Expand</span>
            </button>
          ) : (
            <motion.form
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              onSubmit={handleAddEvent}
              className="p-3.5 rounded-2xl bg-[#f8fafc] border border-[#e2e8f0] space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-bold text-[#1e293b]">New Event Details</span>
                <button
                  type="button"
                  onClick={() => setIsFormExpanded(false)}
                  className="text-[11px] text-[#64748b] hover:text-[#0f172a] cursor-pointer"
                >
                  Cancel
                </button>
              </div>

              <input
                type="text"
                value={newEventTitle}
                onChange={(e) => setNewEventTitle(e.target.value)}
                placeholder="Title (e.g., PM Retinoid Routine, Barrier Repair)..."
                required
                className="w-full px-3.5 py-2 rounded-xl bg-white border border-[#cbd5e1] text-[13px] text-[#1e293b] focus:outline-none focus:border-[#2563eb]"
              />

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-[#64748b] mb-1 block">Time</label>
                  <input
                    type="time"
                    value={newEventTime}
                    onChange={(e) => setNewEventTime(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl bg-white border border-[#cbd5e1] text-[12.5px] text-[#1e293b] focus:outline-none focus:border-[#2563eb]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-[#64748b] mb-1 block">Category</label>
                  <select
                    value={newEventCategory}
                    onChange={(e: any) => setNewEventCategory(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl bg-white border border-[#cbd5e1] text-[12.5px] text-[#1e293b] focus:outline-none focus:border-[#2563eb]"
                  >
                    <option value="routine">Routine</option>
                    <option value="scan">Scan</option>
                    <option value="treatment">Treatment</option>
                    <option value="habit">Habit</option>
                    <option value="wellness">Wellness</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-[#64748b] mb-1 block">Notes / Instructions (Optional)</label>
                <textarea
                  value={newEventNotes}
                  onChange={(e) => setNewEventNotes(e.target.value)}
                  placeholder="Product order, special instructions..."
                  rows={2}
                  className="w-full px-3.5 py-2 rounded-xl bg-white border border-[#cbd5e1] text-[12.5px] text-[#1e293b] focus:outline-none focus:border-[#2563eb] resize-none"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center space-x-2 text-[12px] text-[#475569] font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newEventReminder}
                    onChange={(e) => setNewEventReminder(e.target.checked)}
                    className="rounded text-[#2563eb] focus:ring-[#2563eb]"
                  />
                  <span>Set Active Reminder</span>
                </label>

                <button
                  type="submit"
                  disabled={!newEventTitle.trim()}
                  className="px-4 py-2 rounded-xl bg-[#2563eb] text-white text-[12.5px] font-semibold disabled:opacity-40 hover:bg-[#1d4ed8] transition-colors cursor-pointer shadow-xs"
                >
                  Save Event
                </button>
              </div>
            </motion.form>
          )}
        </div>
      </div>
    </div>
  );
};
