import type { DriveStep } from "driver.js";

const hl = "font-semibold"; // driver.js uses inline HTML, not JSX

export const tourSteps: DriveStep[] = [
  {
    element: "#onborda-trip-mode",
    popover: {
      title: "🚛 Trip Mode",
      description: `Choose between <strong class="${hl}">Round Trip</strong> (out and back) or <strong class="${hl}">One Way</strong> routing.`,
      side: "bottom",
      align: "center",
    },
  },
  {
    element: "#onborda-origin",
    popover: {
      title: "📍 Set Your Origin",
      description: `Select a <strong class="${hl}">starting city</strong> to see available routes from that location. This is the only required field to begin searching.`,
      side: "bottom",
      align: "center",
    },
  },
  {
    element: "#onborda-legs",
    popover: {
      title: "📦 Number of Loads",
      description: `Set how many <strong class="${hl}">loads</strong> (stops) you want in a route. More loads can mean better revenue but longer trips.`,
      side: "bottom",
      align: "center",
    },
  },
  {
    element: "#onborda-leave-by",
    popover: {
      title: "🚀 Leave By",
      description: `Set a <strong class="${hl}">departure date and time</strong>. Routes are simulated from this point to check if pickups, deliveries, and return deadlines can be met.`,
      side: "bottom",
      align: "center",
    },
  },
  {
    element: "#onborda-home-by",
    popover: {
      title: "🏠 Return By",
      description: `Set a <strong class="${hl}">date and time</strong> you need to be back. Routes that can't get you home in time will be filtered out.`,
      side: "bottom",
      align: "center",
    },
  },
  {
    element: "#onborda-idle",
    popover: {
      title: "⏱️ Max Idle Time",
      description: `Choose how long you're willing to <strong class="${hl}">wait between loads</strong> — from 2 hours to keep rolling, up to 24 hours for maximum flexibility.`,
      side: "bottom",
      align: "center",
    },
  },
  {
    element: "#onborda-deadhead",
    popover: {
      title: "🛣️ Max Deadhead",
      description: `Control how far you're willing to <strong class="${hl}">drive empty</strong> between loads, as a percentage of the total trip.`,
      side: "bottom",
      align: "center",
    },
  },
  {
    element: "#onborda-all-filters",
    popover: {
      title: "⚙️ All Filters",
      description: `Fine-tune your search with <strong class="${hl}">trailer type</strong>, <strong class="${hl}">weight limits</strong>, <strong class="${hl}">hazmat</strong>, <strong class="${hl}">TWIC</strong>, <strong class="${hl}">risk</strong>, and <strong class="${hl}">work days</strong>. Set your work days to avoid routes that require pickups or deliveries on your off days.`,
      side: "bottom",
      align: "end",
    },
  },
];
