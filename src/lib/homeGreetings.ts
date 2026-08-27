export interface GreetingEntry {
  id: string;
  template: string;
  hasName: boolean;
  window:
    | 'dawn'
    | 'morning'
    | 'late_morning'
    | 'midday'
    | 'afternoon'
    | 'late_afternoon'
    | 'evening'
    | 'late_night'
    | 'overnight';
  tone?: 'younger' | 'older' | 'neutral';
}

export interface GreetingConfig {
  id: string;
  greeting: string;
  subtext: string;
  iconName: string;
  iconColor: string;
  windowKey: string;
  windowLabel: string;
}

export const ALL_HOME_GREETINGS: GreetingEntry[] = [
  // -------------------------------------------------------------
  // Dawn — 5:00–6:59 (20 from batch 1 + 5 from batch 2 = 25)
  // -------------------------------------------------------------
  { id: 'dawn_01', template: 'Barely morning.', hasName: false, window: 'dawn', tone: 'neutral' },
  { id: 'dawn_02', template: 'Soft gray light.', hasName: false, window: 'dawn', tone: 'neutral' },
  { id: 'dawn_03', template: 'World’s still quiet.', hasName: false, window: 'dawn', tone: 'neutral' },
  { id: 'dawn_04', template: 'Easy now, {name}.', hasName: true, window: 'dawn', tone: 'older' },
  { id: 'dawn_05', template: 'First light.', hasName: false, window: 'dawn', tone: 'neutral' },
  { id: 'dawn_06', template: 'No alarm energy.', hasName: false, window: 'dawn', tone: 'younger' },
  { id: 'dawn_07', template: 'Slow sunrise.', hasName: false, window: 'dawn', tone: 'neutral' },
  { id: 'dawn_08', template: 'Hey — early bird.', hasName: false, window: 'dawn', tone: 'younger' },
  { id: 'dawn_09', template: 'Gentle open.', hasName: false, window: 'dawn', tone: 'neutral' },
  { id: 'dawn_10', template: 'Sky’s just waking.', hasName: false, window: 'dawn', tone: 'neutral' },
  { id: 'dawn_11', template: '{name}. You’re early.', hasName: true, window: 'dawn', tone: 'neutral' },
  { id: 'dawn_12', template: 'Cool air hour.', hasName: false, window: 'dawn', tone: 'neutral' },
  { id: 'dawn_13', template: 'Before the noise.', hasName: false, window: 'dawn', tone: 'neutral' },
  { id: 'dawn_14', template: 'Quiet start.', hasName: false, window: 'dawn', tone: 'neutral' },
  { id: 'dawn_15', template: 'Dawn patrol.', hasName: false, window: 'dawn', tone: 'younger' },
  { id: 'dawn_16', template: 'Soft boots day.', hasName: false, window: 'dawn', tone: 'neutral' },
  { id: 'dawn_17', template: 'Low and slow.', hasName: false, window: 'dawn', tone: 'older' },
  { id: 'dawn_18', template: 'Morning hasn’t committed yet.', hasName: false, window: 'dawn', tone: 'neutral' },
  { id: 'dawn_19', template: 'Breathe once.', hasName: false, window: 'dawn', tone: 'neutral' },
  { id: 'dawn_20', template: 'Early is allowed.', hasName: false, window: 'dawn', tone: 'neutral' },
  { id: 'dawn_21', template: 'Early light. Easy does it.', hasName: false, window: 'dawn', tone: 'older' },
  { id: 'dawn_22', template: 'Quiet morning, {name}.', hasName: true, window: 'dawn', tone: 'neutral' },
  { id: 'dawn_23', template: 'Up with the sun.', hasName: false, window: 'dawn', tone: 'neutral' },
  { id: 'dawn_24', template: 'Soft start.', hasName: false, window: 'dawn', tone: 'neutral' },
  { id: 'dawn_25', template: 'Hey — still dark out. Be gentle with yourself.', hasName: false, window: 'dawn', tone: 'neutral' },

  // -------------------------------------------------------------
  // Morning — 7:00–9:59 (30 from batch 1 + 7 from batch 2 = 37)
  // -------------------------------------------------------------
  { id: 'morn_01', template: 'Morning.', hasName: false, window: 'morning', tone: 'neutral' },
  { id: 'morn_02', template: 'Hey {name}.', hasName: true, window: 'morning', tone: 'younger' },
  { id: 'morn_03', template: 'Sun’s out.', hasName: false, window: 'morning', tone: 'neutral' },
  { id: 'morn_04', template: 'Fresh page.', hasName: false, window: 'morning', tone: 'neutral' },
  { id: 'morn_05', template: 'Boots on.', hasName: false, window: 'morning', tone: 'neutral' },
  { id: 'morn_06', template: 'Good light today.', hasName: false, window: 'morning', tone: 'neutral' },
  { id: 'morn_07', template: 'Start clean.', hasName: false, window: 'morning', tone: 'neutral' },
  { id: 'morn_08', template: 'Coffee first.', hasName: false, window: 'morning', tone: 'neutral' },
  { id: 'morn_09', template: 'Rise easy.', hasName: false, window: 'morning', tone: 'older' },
  { id: 'morn_10', template: 'Morning hit different.', hasName: false, window: 'morning', tone: 'younger' },
  { id: 'morn_11', template: '{name} — you made it up.', hasName: true, window: 'morning', tone: 'younger' },
  { id: 'morn_12', template: 'Clear head hour.', hasName: false, window: 'morning', tone: 'neutral' },
  { id: 'morn_13', template: 'Let’s not rush this.', hasName: false, window: 'morning', tone: 'older' },
  { id: 'morn_14', template: 'Bright enough.', hasName: false, window: 'morning', tone: 'neutral' },
  { id: 'morn_15', template: 'New air.', hasName: false, window: 'morning', tone: 'neutral' },
  { id: 'morn_16', template: 'Face the day soft.', hasName: false, window: 'morning', tone: 'neutral' },
  { id: 'morn_17', template: 'Hey there.', hasName: false, window: 'morning', tone: 'neutral' },
  { id: 'morn_18', template: 'Morning’s on your side.', hasName: false, window: 'morning', tone: 'neutral' },
  { id: 'morn_19', template: 'Unhurried.', hasName: false, window: 'morning', tone: 'older' },
  { id: 'morn_20', template: 'Good to see you.', hasName: false, window: 'morning', tone: 'neutral' },
  { id: 'morn_21', template: 'Start where you are.', hasName: false, window: 'morning', tone: 'neutral' },
  { id: 'morn_22', template: 'Light’s friendly.', hasName: false, window: 'morning', tone: 'neutral' },
  { id: 'morn_23', template: '{name}. Simple morning.', hasName: true, window: 'morning', tone: 'neutral' },
  { id: 'morn_24', template: 'No performance needed.', hasName: false, window: 'morning', tone: 'neutral' },
  { id: 'morn_25', template: 'Easy does the morning.', hasName: false, window: 'morning', tone: 'older' },
  { id: 'morn_26', template: 'Stretch and go.', hasName: false, window: 'morning', tone: 'younger' },
  { id: 'morn_27', template: 'Hello, daylight.', hasName: false, window: 'morning', tone: 'neutral' },
  { id: 'morn_28', template: 'Steady start.', hasName: false, window: 'morning', tone: 'neutral' },
  { id: 'morn_29', template: 'Morning, stranger to stress.', hasName: false, window: 'morning', tone: 'neutral' },
  { id: 'morn_30', template: 'You’ve got this hour.', hasName: false, window: 'morning', tone: 'neutral' },
  { id: 'morn_31', template: 'Morning, sunshine.', hasName: false, window: 'morning', tone: 'neutral' },
  { id: 'morn_32', template: 'Rise and shine, {name}.', hasName: true, window: 'morning', tone: 'neutral' },
  { id: 'morn_33', template: 'Fresh start.', hasName: false, window: 'morning', tone: 'neutral' },
  { id: 'morn_34', template: 'Coffee weather.', hasName: false, window: 'morning', tone: 'neutral' },
  { id: 'morn_35', template: 'Good morning — face first, phone later.', hasName: false, window: 'morning', tone: 'neutral' },
  { id: 'morn_36', template: 'Hey {name}, morning’s looking kind.', hasName: true, window: 'morning', tone: 'neutral' },
  { id: 'morn_37', template: 'New day. No rush.', hasName: false, window: 'morning', tone: 'older' },

  // -------------------------------------------------------------
  // Late morning — 10:00–11:59 (20 from batch 1 + 5 from batch 2 = 25)
  // -------------------------------------------------------------
  { id: 'lmorn_01', template: 'Still morning, technically.', hasName: false, window: 'late_morning', tone: 'younger' },
  { id: 'lmorn_02', template: 'Mid-morning hi.', hasName: false, window: 'late_morning', tone: 'neutral' },
  { id: 'lmorn_03', template: 'Hey.', hasName: false, window: 'late_morning', tone: 'younger' },
  { id: 'lmorn_04', template: 'Day’s open.', hasName: false, window: 'late_morning', tone: 'neutral' },
  { id: 'lmorn_05', template: '{name}. Checking in.', hasName: true, window: 'late_morning', tone: 'neutral' },
  { id: 'lmorn_06', template: 'Not noon yet.', hasName: false, window: 'late_morning', tone: 'neutral' },
  { id: 'lmorn_07', template: 'Keep it light.', hasName: false, window: 'late_morning', tone: 'neutral' },
  { id: 'lmorn_08', template: 'Good pace.', hasName: false, window: 'late_morning', tone: 'neutral' },
  { id: 'lmorn_09', template: 'Sun’s higher.', hasName: false, window: 'late_morning', tone: 'neutral' },
  { id: 'lmorn_10', template: 'You’re in it now.', hasName: false, window: 'late_morning', tone: 'neutral' },
  { id: 'lmorn_11', template: 'Late morning calm.', hasName: false, window: 'late_morning', tone: 'older' },
  { id: 'lmorn_12', template: 'No crisis hour.', hasName: false, window: 'late_morning', tone: 'neutral' },
  { id: 'lmorn_13', template: '{name} — still early enough.', hasName: true, window: 'late_morning', tone: 'neutral' },
  { id: 'lmorn_14', template: 'Browse the day.', hasName: false, window: 'late_morning', tone: 'neutral' },
  { id: 'lmorn_15', template: 'Soft focus.', hasName: false, window: 'late_morning', tone: 'neutral' },
  { id: 'lmorn_16', template: 'Time’s generous.', hasName: false, window: 'late_morning', tone: 'older' },
  { id: 'lmorn_17', template: 'Moving okay?', hasName: false, window: 'late_morning', tone: 'neutral' },
  { id: 'lmorn_18', template: 'Light workload energy.', hasName: false, window: 'late_morning', tone: 'younger' },
  { id: 'lmorn_19', template: 'Hey, you’re here.', hasName: false, window: 'late_morning', tone: 'neutral' },
  { id: 'lmorn_20', template: 'Morning’s almost spent.', hasName: false, window: 'late_morning', tone: 'neutral' },
  { id: 'lmorn_21', template: 'Still morning, somehow.', hasName: false, window: 'late_morning', tone: 'neutral' },
  { id: 'lmorn_22', template: 'Hey {name}.', hasName: true, window: 'late_morning', tone: 'younger' },
  { id: 'lmorn_23', template: 'Mid-morning calm.', hasName: false, window: 'late_morning', tone: 'older' },
  { id: 'lmorn_24', template: 'Hope the day’s treating you okay.', hasName: false, window: 'late_morning', tone: 'neutral' },
  { id: 'lmorn_25', template: 'Light’s good right now.', hasName: false, window: 'late_morning', tone: 'neutral' },

  // -------------------------------------------------------------
  // Midday — 12:00–13:59 (25 from batch 1 + 5 from batch 2 = 30)
  // -------------------------------------------------------------
  { id: 'mid_01', template: 'Noon-ish.', hasName: false, window: 'midday', tone: 'younger' },
  { id: 'mid_02', template: 'High sun.', hasName: false, window: 'midday', tone: 'neutral' },
  { id: 'mid_03', template: 'Lunch window.', hasName: false, window: 'midday', tone: 'neutral' },
  { id: 'mid_04', template: 'Hey {name}.', hasName: true, window: 'midday', tone: 'younger' },
  { id: 'mid_05', template: 'Middle chapter.', hasName: false, window: 'midday', tone: 'neutral' },
  { id: 'mid_06', template: 'Day’s peak light.', hasName: false, window: 'midday', tone: 'neutral' },
  { id: 'mid_07', template: 'Take a beat.', hasName: false, window: 'midday', tone: 'older' },
  { id: 'mid_08', template: 'Center of the day.', hasName: false, window: 'midday', tone: 'neutral' },
  { id: 'mid_09', template: 'Fuel up if you need.', hasName: false, window: 'midday', tone: 'neutral' },
  { id: 'mid_10', template: 'Checking the pulse.', hasName: false, window: 'midday', tone: 'neutral' },
  { id: 'mid_11', template: '{name}. Midday.', hasName: true, window: 'midday', tone: 'neutral' },
  { id: 'mid_12', template: 'Not morning, not night.', hasName: false, window: 'midday', tone: 'neutral' },
  { id: 'mid_13', template: 'Straight through.', hasName: false, window: 'midday', tone: 'neutral' },
  { id: 'mid_14', template: 'Bright out.', hasName: false, window: 'midday', tone: 'neutral' },
  { id: 'mid_15', template: 'Hold steady.', hasName: false, window: 'midday', tone: 'neutral' },
  { id: 'mid_16', template: 'Noon doesn’t ask much.', hasName: false, window: 'midday', tone: 'neutral' },
  { id: 'mid_17', template: 'You’re halfway-ish.', hasName: false, window: 'midday', tone: 'younger' },
  { id: 'mid_18', template: 'Simple midday.', hasName: false, window: 'midday', tone: 'neutral' },
  { id: 'mid_19', template: 'Hey — pause allowed.', hasName: false, window: 'midday', tone: 'neutral' },
  { id: 'mid_20', template: 'Sun overhead.', hasName: false, window: 'midday', tone: 'neutral' },
  { id: 'mid_21', template: 'Keep vitals in mind.', hasName: false, window: 'midday', tone: 'neutral' },
  { id: 'mid_22', template: 'Light lunch energy.', hasName: false, window: 'midday', tone: 'younger' },
  { id: 'mid_23', template: '{name}, still here.', hasName: true, window: 'midday', tone: 'neutral' },
  { id: 'mid_24', template: 'Day’s thickest light.', hasName: false, window: 'midday', tone: 'neutral' },
  { id: 'mid_25', template: 'No drama noon.', hasName: false, window: 'midday', tone: 'neutral' },
  { id: 'mid_26', template: 'Afternoon already?', hasName: false, window: 'midday', tone: 'younger' },
  { id: 'mid_27', template: 'Hey. Lunch-ish hours.', hasName: false, window: 'midday', tone: 'younger' },
  { id: 'mid_28', template: 'Middle of the day, {name}.', hasName: true, window: 'midday', tone: 'neutral' },
  { id: 'mid_29', template: 'Sun’s up. Keep it simple.', hasName: false, window: 'midday', tone: 'neutral' },
  { id: 'mid_30', template: 'Checking in.', hasName: false, window: 'midday', tone: 'neutral' },

  // -------------------------------------------------------------
  // Afternoon — 14:00–16:59 (30 from batch 1 + 6 from batch 2 = 36)
  // -------------------------------------------------------------
  { id: 'aft_01', template: 'Afternoon.', hasName: false, window: 'afternoon', tone: 'neutral' },
  { id: 'aft_02', template: 'Hey {name}.', hasName: true, window: 'afternoon', tone: 'younger' },
  { id: 'aft_03', template: 'Second wind optional.', hasName: false, window: 'afternoon', tone: 'younger' },
  { id: 'aft_04', template: 'Day’s long middle.', hasName: false, window: 'afternoon', tone: 'neutral' },
  { id: 'aft_05', template: 'Still with you.', hasName: false, window: 'afternoon', tone: 'neutral' },
  { id: 'aft_06', template: 'Afternoon stretch.', hasName: false, window: 'afternoon', tone: 'neutral' },
  { id: 'aft_07', template: 'Slope of the day.', hasName: false, window: 'afternoon', tone: 'neutral' },
  { id: 'aft_08', template: 'Easy does it.', hasName: false, window: 'afternoon', tone: 'older' },
  { id: 'aft_09', template: '{name}. Afternoon.', hasName: true, window: 'afternoon', tone: 'neutral' },
  { id: 'aft_10', template: 'Not done yet.', hasName: false, window: 'afternoon', tone: 'neutral' },
  { id: 'aft_11', template: 'Warm hours.', hasName: false, window: 'afternoon', tone: 'neutral' },
  { id: 'aft_12', template: 'Keep pace, not pressure.', hasName: false, window: 'afternoon', tone: 'older' },
  { id: 'aft_13', template: 'Hi from the afternoon.', hasName: false, window: 'afternoon', tone: 'neutral' },
  { id: 'aft_14', template: 'Rolling along.', hasName: false, window: 'afternoon', tone: 'neutral' },
  { id: 'aft_15', template: 'Light’s changing.', hasName: false, window: 'afternoon', tone: 'neutral' },
  { id: 'aft_16', template: 'You’re fine.', hasName: false, window: 'afternoon', tone: 'neutral' },
  { id: 'aft_17', template: 'Afternoon check.', hasName: false, window: 'afternoon', tone: 'neutral' },
  { id: 'aft_18', template: '{name} — still upright.', hasName: true, window: 'afternoon', tone: 'younger' },
  { id: 'aft_19', template: 'Soft grind hours.', hasName: false, window: 'afternoon', tone: 'younger' },
  { id: 'aft_20', template: 'No need to sprint.', hasName: false, window: 'afternoon', tone: 'older' },
  { id: 'aft_21', template: 'Day’s got room.', hasName: false, window: 'afternoon', tone: 'neutral' },
  { id: 'aft_22', template: 'Hey. Breathe.', hasName: false, window: 'afternoon', tone: 'neutral' },
  { id: 'aft_23', template: 'Afternoon air.', hasName: false, window: 'afternoon', tone: 'neutral' },
  { id: 'aft_24', template: 'One thing at a time.', hasName: false, window: 'afternoon', tone: 'older' },
  { id: 'aft_25', template: 'Glad you opened this.', hasName: false, window: 'afternoon', tone: 'neutral' },
  { id: 'aft_26', template: 'Steady afternoon.', hasName: false, window: 'afternoon', tone: 'neutral' },
  { id: 'aft_27', template: '{name}. Low drama.', hasName: true, window: 'afternoon', tone: 'younger' },
  { id: 'aft_28', template: 'Sun’s a little lower.', hasName: false, window: 'afternoon', tone: 'neutral' },
  { id: 'aft_29', template: 'Keep it human.', hasName: false, window: 'afternoon', tone: 'neutral' },
  { id: 'aft_30', template: 'Afternoon’s okay.', hasName: false, window: 'afternoon', tone: 'neutral' },
  { id: 'aft_31', template: 'Afternoon, {name}.', hasName: true, window: 'afternoon', tone: 'neutral' },
  { id: 'aft_32', template: 'Hey — afternoon stretch.', hasName: false, window: 'afternoon', tone: 'neutral' },
  { id: 'aft_33', template: 'Day’s rolling.', hasName: false, window: 'afternoon', tone: 'neutral' },
  { id: 'aft_34', template: 'Still going strong?', hasName: false, window: 'afternoon', tone: 'younger' },
  { id: 'aft_35', template: 'Easy afternoon.', hasName: false, window: 'afternoon', tone: 'older' },
  { id: 'aft_36', template: '{name}. Made it this far.', hasName: true, window: 'afternoon', tone: 'neutral' },

  // -------------------------------------------------------------
  // Late afternoon — 17:00–18:59 (20 from batch 1 + 5 from batch 2 = 25)
  // -------------------------------------------------------------
  { id: 'laft_01', template: 'Almost evening.', hasName: false, window: 'late_afternoon', tone: 'neutral' },
  { id: 'laft_02', template: 'Golden edge.', hasName: false, window: 'late_afternoon', tone: 'neutral' },
  { id: 'laft_03', template: 'Day’s leaning out.', hasName: false, window: 'late_afternoon', tone: 'neutral' },
  { id: 'laft_04', template: '{name}. Late day.', hasName: true, window: 'late_afternoon', tone: 'neutral' },
  { id: 'laft_05', template: 'Wind-down runway.', hasName: false, window: 'late_afternoon', tone: 'older' },
  { id: 'laft_06', template: 'Light’s getting kind.', hasName: false, window: 'late_afternoon', tone: 'neutral' },
  { id: 'laft_07', template: 'Last bright hour.', hasName: false, window: 'late_afternoon', tone: 'neutral' },
  { id: 'laft_08', template: 'Ease off the gas.', hasName: false, window: 'late_afternoon', tone: 'older' },
  { id: 'laft_09', template: 'Hey — long day?', hasName: false, window: 'late_afternoon', tone: 'younger' },
  { id: 'laft_10', template: 'Sunset approach.', hasName: false, window: 'late_afternoon', tone: 'neutral' },
  { id: 'laft_11', template: '{name}. You did a day.', hasName: true, window: 'late_afternoon', tone: 'neutral' },
  { id: 'laft_12', template: 'Soft landing starts now.', hasName: false, window: 'late_afternoon', tone: 'older' },
  { id: 'laft_13', template: 'Clock’s friendlier.', hasName: false, window: 'late_afternoon', tone: 'neutral' },
  { id: 'laft_14', template: 'Afternoon’s over, basically.', hasName: false, window: 'late_afternoon', tone: 'neutral' },
  { id: 'laft_15', template: 'Good time to slow.', hasName: false, window: 'late_afternoon', tone: 'older' },
  { id: 'laft_16', template: 'Shadows getting long.', hasName: false, window: 'late_afternoon', tone: 'neutral' },
  { id: 'laft_17', template: 'Almost home hours.', hasName: false, window: 'late_afternoon', tone: 'neutral' },
  { id: 'laft_18', template: '{name}. Ease in.', hasName: true, window: 'late_afternoon', tone: 'older' },
  { id: 'laft_19', template: 'Day paid its dues.', hasName: false, window: 'late_afternoon', tone: 'neutral' },
  { id: 'laft_20', template: 'Golden, not gone.', hasName: false, window: 'late_afternoon', tone: 'neutral' },
  { id: 'laft_21', template: 'Golden hour-ish.', hasName: false, window: 'late_afternoon', tone: 'younger' },
  { id: 'laft_22', template: 'Day’s winding down.', hasName: false, window: 'late_afternoon', tone: 'older' },
  { id: 'laft_23', template: 'Evening’s almost here, {name}.', hasName: true, window: 'late_afternoon', tone: 'neutral' },
  { id: 'laft_24', template: 'Soft light. Good time to slow up.', hasName: false, window: 'late_afternoon', tone: 'older' },
  { id: 'laft_25', template: 'Hey — almost done with the day.', hasName: false, window: 'late_afternoon', tone: 'younger' },

  // -------------------------------------------------------------
  // Evening — 19:00–21:59 (25 from batch 1 + 6 from batch 2 = 31)
  // -------------------------------------------------------------
  { id: 'eve_01', template: 'Evening.', hasName: false, window: 'evening', tone: 'neutral' },
  { id: 'eve_02', template: 'Hey {name}.', hasName: true, window: 'evening', tone: 'younger' },
  { id: 'eve_03', template: 'Night’s on deck.', hasName: false, window: 'evening', tone: 'younger' },
  { id: 'eve_04', template: 'Home hours.', hasName: false, window: 'evening', tone: 'neutral' },
  { id: 'eve_05', template: 'Dim the day.', hasName: false, window: 'evening', tone: 'older' },
  { id: 'eve_06', template: 'Evening calm.', hasName: false, window: 'evening', tone: 'older' },
  { id: 'eve_07', template: 'You can clock out soft.', hasName: false, window: 'evening', tone: 'neutral' },
  { id: 'eve_08', template: '{name}. Evening.', hasName: true, window: 'evening', tone: 'neutral' },
  { id: 'eve_09', template: 'Lights lower.', hasName: false, window: 'evening', tone: 'neutral' },
  { id: 'eve_10', template: 'No more proving.', hasName: false, window: 'evening', tone: 'neutral' },
  { id: 'eve_11', template: 'Easy night ahead.', hasName: false, window: 'evening', tone: 'older' },
  { id: 'eve_12', template: 'Settle in.', hasName: false, window: 'evening', tone: 'older' },
  { id: 'eve_13', template: 'Evening’s here.', hasName: false, window: 'evening', tone: 'neutral' },
  { id: 'eve_14', template: 'Put the day down.', hasName: false, window: 'evening', tone: 'older' },
  { id: 'eve_15', template: '{name} — rest mode unlocked.', hasName: true, window: 'evening', tone: 'younger' },
  { id: 'eve_16', template: 'Quiet is allowed.', hasName: false, window: 'evening', tone: 'neutral' },
  { id: 'eve_17', template: 'Night layer.', hasName: false, window: 'evening', tone: 'neutral' },
  { id: 'eve_18', template: 'Soft house energy.', hasName: false, window: 'evening', tone: 'neutral' },
  { id: 'eve_19', template: 'Hey. You made it.', hasName: false, window: 'evening', tone: 'younger' },
  { id: 'eve_20', template: 'Evening check-in.', hasName: false, window: 'evening', tone: 'neutral' },
  { id: 'eve_21', template: 'Nowhere to be but here.', hasName: false, window: 'evening', tone: 'older' },
  { id: 'eve_22', template: '{name}. Low lights.', hasName: true, window: 'evening', tone: 'neutral' },
  { id: 'eve_23', template: 'Let the day go.', hasName: false, window: 'evening', tone: 'older' },
  { id: 'eve_24', template: 'Comfort hour.', hasName: false, window: 'evening', tone: 'neutral' },
  { id: 'eve_25', template: 'Evening doesn’t need a speech.', hasName: false, window: 'evening', tone: 'neutral' },
  { id: 'eve_26', template: 'Evening, {name}.', hasName: true, window: 'evening', tone: 'neutral' },
  { id: 'eve_27', template: 'Night’s settling in.', hasName: false, window: 'evening', tone: 'older' },
  { id: 'eve_28', template: 'Hey. Take the edge off.', hasName: false, window: 'evening', tone: 'younger' },
  { id: 'eve_29', template: 'Home stretch.', hasName: false, window: 'evening', tone: 'neutral' },
  { id: 'eve_30', template: 'Easy evening.', hasName: false, window: 'evening', tone: 'older' },
  { id: 'eve_31', template: '{name} — clock’s on your side now.', hasName: true, window: 'evening', tone: 'neutral' },

  // -------------------------------------------------------------
  // Late night — 22:00–23:59 (15 from batch 1 + 5 from batch 2 = 20)
  // -------------------------------------------------------------
  { id: 'lnight_01', template: 'Late.', hasName: false, window: 'late_night', tone: 'younger' },
  { id: 'lnight_02', template: 'Still up, {name}?', hasName: true, window: 'late_night', tone: 'younger' },
  { id: 'lnight_03', template: 'Night deepens.', hasName: false, window: 'late_night', tone: 'neutral' },
  { id: 'lnight_04', template: 'Quiet town hours.', hasName: false, window: 'late_night', tone: 'neutral' },
  { id: 'lnight_05', template: 'Wind it down.', hasName: false, window: 'late_night', tone: 'older' },
  { id: 'lnight_06', template: 'Sleep’s in the neighborhood.', hasName: false, window: 'late_night', tone: 'neutral' },
  { id: 'lnight_07', template: '{name}. Late shift.', hasName: true, window: 'late_night', tone: 'younger' },
  { id: 'lnight_08', template: 'Soft close.', hasName: false, window: 'late_night', tone: 'older' },
  { id: 'lnight_09', template: 'Tomorrow’s already loading.', hasName: false, window: 'late_night', tone: 'younger' },
  { id: 'lnight_10', template: 'Dim everything.', hasName: false, window: 'late_night', tone: 'neutral' },
  { id: 'lnight_11', template: 'Late-night honesty.', hasName: false, window: 'late_night', tone: 'neutral' },
  { id: 'lnight_12', template: 'No more tasks.', hasName: false, window: 'late_night', tone: 'older' },
  { id: 'lnight_13', template: '{name}. Bed’s an option.', hasName: true, window: 'late_night', tone: 'younger' },
  { id: 'lnight_14', template: 'Hush hour.', hasName: false, window: 'late_night', tone: 'neutral' },
  { id: 'lnight_15', template: 'Close the loop.', hasName: false, window: 'late_night', tone: 'neutral' },
  { id: 'lnight_16', template: 'Late night, {name}.', hasName: true, window: 'late_night', tone: 'neutral' },
  { id: 'lnight_17', template: 'Still up?', hasName: false, window: 'late_night', tone: 'younger' },
  { id: 'lnight_18', template: 'Quiet hours.', hasName: false, window: 'late_night', tone: 'older' },
  { id: 'lnight_19', template: 'Wind it down.', hasName: false, window: 'late_night', tone: 'older' },
  { id: 'lnight_20', template: 'Night mode.', hasName: false, window: 'late_night', tone: 'younger' },

  // -------------------------------------------------------------
  // Overnight — 0:00–4:59 (15 from batch 1 + 6 from batch 2 = 21)
  // -------------------------------------------------------------
  { id: 'over_01', template: 'Past midnight.', hasName: false, window: 'overnight', tone: 'neutral' },
  { id: 'over_02', template: 'Odd hour, {name}.', hasName: true, window: 'overnight', tone: 'younger' },
  { id: 'over_03', template: 'World’s asleep-ish.', hasName: false, window: 'overnight', tone: 'younger' },
  { id: 'over_04', template: 'You’re okay.', hasName: false, window: 'overnight', tone: 'neutral' },
  { id: 'over_05', template: 'Night watch.', hasName: false, window: 'overnight', tone: 'neutral' },
  { id: 'over_06', template: 'Soft and strange hours.', hasName: false, window: 'overnight', tone: 'neutral' },
  { id: 'over_07', template: '{name}. Can’t sleep?', hasName: true, window: 'overnight', tone: 'younger' },
  { id: 'over_08', template: 'Rest when it comes.', hasName: false, window: 'overnight', tone: 'older' },
  { id: 'over_09', template: 'Dark outside. Fine inside.', hasName: false, window: 'overnight', tone: 'neutral' },
  { id: 'over_10', template: 'No schedule here.', hasName: false, window: 'overnight', tone: 'neutral' },
  { id: 'over_11', template: 'Midnight adjacent.', hasName: false, window: 'overnight', tone: 'neutral' },
  { id: 'over_12', template: 'Be gentle in the dark.', hasName: false, window: 'overnight', tone: 'older' },
  { id: 'over_13', template: '{name}. This hour is slow.', hasName: true, window: 'overnight', tone: 'neutral' },
  { id: 'over_14', template: 'Nothing urgent at 3am.', hasName: false, window: 'overnight', tone: 'neutral' },
  { id: 'over_15', template: 'Hi from the deep night.', hasName: false, window: 'overnight', tone: 'neutral' },
  { id: 'over_16', template: 'Late one.', hasName: false, window: 'overnight', tone: 'younger' },
  { id: 'over_17', template: 'Can’t sleep? You’re not alone.', hasName: false, window: 'overnight', tone: 'neutral' },
  { id: 'over_18', template: 'Middle of the night. Be kind.', hasName: false, window: 'overnight', tone: 'older' },
  { id: 'over_19', template: 'Rest when you can, {name}.', hasName: true, window: 'overnight', tone: 'older' },
  { id: 'over_20', template: 'Odd hour. Soft landing.', hasName: false, window: 'overnight', tone: 'older' },
  { id: 'over_21', template: 'Wherever you are in the night — hi.', hasName: false, window: 'overnight', tone: 'neutral' }
];

export type GreetingWindow =
  | 'dawn'
  | 'morning'
  | 'late_morning'
  | 'midday'
  | 'afternoon'
  | 'late_afternoon'
  | 'evening'
  | 'late_night'
  | 'overnight';

export const getGreetingWindow = (hour: number): GreetingWindow => {
  if (hour >= 5 && hour < 7) return 'dawn';
  if (hour >= 7 && hour < 10) return 'morning';
  if (hour >= 10 && hour < 12) return 'late_morning';
  if (hour >= 12 && hour < 14) return 'midday';
  if (hour >= 14 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 19) return 'late_afternoon';
  if (hour >= 19 && hour < 22) return 'evening';
  if (hour >= 22 && hour < 24) return 'late_night';
  return 'overnight'; // 0:00 - 4:59
};

const RECENT_GREETINGS_STORAGE_KEY = 'sana_recent_greeting_ids';
const MAX_DEDUPE_HISTORY = 5;

export const getRecentGreetingIds = (): string[] => {
  try {
    const raw = localStorage.getItem(RECENT_GREETINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.slice(-MAX_DEDUPE_HISTORY);
    }
  } catch {
    // Ignore storage errors
  }
  return [];
};

export const recordGreetingShown = (id: string): void => {
  try {
    const history = getRecentGreetingIds();
    const updated = [...history.filter(existing => existing !== id), id].slice(-MAX_DEDUPE_HISTORY);
    localStorage.setItem(RECENT_GREETINGS_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage errors
  }
};

export interface GreetingPickerOptions {
  name?: string;
  ageGroup?: string;
  gender?: string;
  cycleOffset?: number;
  forceHour?: number;
}

const WINDOW_ATMOSPHERE: Record<
  GreetingWindow,
  { label: string; subtext: string; iconName: string; iconColor: string }
> = {
  dawn: {
    label: 'Dawn',
    subtext: 'First light • Soft start before the noise',
    iconName: 'solar:sun-fog-bold-duotone',
    iconColor: 'text-amber-500'
  },
  morning: {
    label: 'Morning',
    subtext: 'Morning vital check & hydration window',
    iconName: 'solar:sun-2-bold-duotone',
    iconColor: 'text-amber-500'
  },
  late_morning: {
    label: 'Late Morning',
    subtext: 'Hydrate & check ambient humidity',
    iconName: 'solar:sun-bold-duotone',
    iconColor: 'text-amber-400'
  },
  midday: {
    label: 'Midday',
    subtext: 'Peak UV & thermal load • Hydrate & pace exertion',
    iconName: 'solar:sun-bold-duotone',
    iconColor: 'text-amber-400'
  },
  afternoon: {
    label: 'Afternoon',
    subtext: 'Midday movement & energy recharge',
    iconName: 'solar:sun-2-bold-duotone',
    iconColor: 'text-amber-500'
  },
  late_afternoon: {
    label: 'Golden Hour',
    subtext: 'Golden light • Ease off the day',
    iconName: 'solar:sunset-bold-duotone',
    iconColor: 'text-orange-500'
  },
  evening: {
    label: 'Evening',
    subtext: 'Evening wind-down & vital recovery window',
    iconName: 'solar:sunset-bold-duotone',
    iconColor: 'text-orange-500'
  },
  late_night: {
    label: 'Late Night',
    subtext: 'Rest mode • Cellular repair underway',
    iconName: 'solar:moon-stars-bold-duotone',
    iconColor: 'text-indigo-400'
  },
  overnight: {
    label: 'Deep Night',
    subtext: 'Quiet hours • Overnight cellular recovery',
    iconName: 'solar:moon-bold-duotone',
    iconColor: 'text-indigo-400'
  }
};

/**
 * Cleanly formats the user's preferred first name only
 */
export const extractPreferredFirstName = (rawName?: string): string => {
  if (!rawName) return 'friend';
  const trimmed = rawName.trim();
  if (!trimmed) return 'friend';
  // Take first word or nickname, strip special trailing chars
  const firstWord = trimmed.split(/\s+/)[0];
  return firstWord.charAt(0).toUpperCase() + firstWord.slice(1);
};

/**
 * Intelligent home greeting picker matching all guidelines:
 * - 250 warm American greetings strictly partitioned across 9 diurnal windows
 * - 30–45% target name frequency across shows
 * - Age/tone weighted selection
 * - 5-entry local dedupe history to prevent repeats
 */
export const pickHomeGreeting = (options: GreetingPickerOptions = {}): GreetingConfig => {
  const now = new Date();
  const currentHour = options.forceHour !== undefined ? options.forceHour : now.getHours();
  const windowKey = getGreetingWindow(currentHour);
  const atmosphere = WINDOW_ATMOSPHERE[windowKey];

  const pool = ALL_HOME_GREETINGS.filter(item => item.window === windowKey);
  if (pool.length === 0) {
    return {
      id: 'fallback',
      greeting: 'Good to see you.',
      subtext: atmosphere.subtext,
      iconName: atmosphere.iconName,
      iconColor: atmosphere.iconColor,
      windowKey,
      windowLabel: atmosphere.label
    };
  }

  const recentIds = getRecentGreetingIds();
  // Filter out the last 5 shown greetings unless that empties the pool
  let candidatePool = pool.filter(item => !recentIds.includes(item.id));
  if (candidatePool.length === 0) {
    candidatePool = pool;
  }

  // Tonal weighting based on age group if present
  const ageGroup = (options.ageGroup || '').toLowerCase();
  const isYounger = ageGroup.includes('teen') || ageGroup.includes('20') || ageGroup.includes('gen z');
  const isOlder = ageGroup.includes('50') || ageGroup.includes('60') || ageGroup.includes('mature');

  let weightedPool: GreetingEntry[] = [];
  for (const item of candidatePool) {
    let weight = 1;
    if (isYounger && item.tone === 'younger') weight = 2.5;
    if (isOlder && item.tone === 'older') weight = 2.5;
    for (let i = 0; i < weight; i++) {
      weightedPool.push(item);
    }
  }

  // If cycling manually, select via deterministic offset, otherwise pseudo-random with name balance
  const cycleOffset = options.cycleOffset || 0;
  let selectedEntry: GreetingEntry;

  if (cycleOffset > 0) {
    selectedEntry = candidatePool[cycleOffset % candidatePool.length];
  } else {
    // 30–45% target name balance:
    // If pool has both name and no-name entries, decide based on ~35% probability
    const nameEntries = weightedPool.filter(i => i.hasName);
    const noNameEntries = weightedPool.filter(i => !i.hasName);

    const wantsName = Math.random() < 0.38; // ~38% frequency
    if (wantsName && nameEntries.length > 0) {
      selectedEntry = nameEntries[Math.floor(Math.random() * nameEntries.length)];
    } else if (noNameEntries.length > 0) {
      selectedEntry = noNameEntries[Math.floor(Math.random() * noNameEntries.length)];
    } else {
      selectedEntry = weightedPool[Math.floor(Math.random() * weightedPool.length)];
    }
  }

  // Record into dedupe memory
  recordGreetingShown(selectedEntry.id);

  // Format greeting string
  const firstName = extractPreferredFirstName(options.name);
  let finalGreeting = selectedEntry.template;
  if (selectedEntry.hasName) {
    finalGreeting = finalGreeting.replace(/\{name\}/g, firstName);
  }

  return {
    id: selectedEntry.id,
    greeting: finalGreeting,
    subtext: atmosphere.subtext,
    iconName: atmosphere.iconName,
    iconColor: atmosphere.iconColor,
    windowKey,
    windowLabel: atmosphere.label
  };
};
