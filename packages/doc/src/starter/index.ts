import type { CherryDocument } from "../schema";
import babyShowerInvite from "./baby-shower-invite";
import birthdayCard from "./birthday-card";
import bookClubCover from "./book-club-cover";
import brandKickoff from "./brand-kickoff";
import businessCardBold from "./business-card-bold";
import businessCardMinimal from "./business-card-minimal";
import cafeMenu from "./cafe-menu";
import certificate from "./certificate";
import coffeeMenuPost from "./coffee-menu-post";
import concertPoster from "./concert-poster";
import flashSaleStory from "./flash-sale-story";
import jazzNightFlyer from "./jazz-night-flyer";
import lessonSlides from "./lesson-slides";
import openStudioPoster from "./open-studio-poster";
import pitchDeck from "./pitch-deck";
import podcastThumbnail from "./podcast-thumbnail";
import quarterlyReview from "./quarterly-review";
import quotePost from "./quote-post";
import recipePin from "./recipe-pin";
import saturdayMarket from "./saturday-market";
import thankYouPostcard from "./thank-you-postcard";
import weddingInvitation from "./wedding-invitation";
import workshopPost from "./workshop-post";
import yardSalePoster from "./yard-sale-poster";

export type StarterCategory = "social" | "presentation" | "print" | "cards";
export type StarterTemplate = { id: string; name: string; category: StarterCategory; doc: CherryDocument };

const entry = (category: StarterCategory, doc: CherryDocument): StarterTemplate => ({ id: doc.id, name: doc.title, category, doc });

/**
 * Built-in starter designs: pure data, no images, catalogue fonts only. "Use" imports one as a new design (no database rows).
 * Home lists them in this order, so the first four cover one category each.
 */
export const STARTER_TEMPLATES: StarterTemplate[] = [
  entry("social", saturdayMarket),
  entry("presentation", brandKickoff),
  entry("print", jazzNightFlyer),
  entry("cards", weddingInvitation),
  entry("social", flashSaleStory),
  entry("print", concertPoster),
  entry("cards", businessCardMinimal),
  entry("presentation", pitchDeck),
  entry("social", coffeeMenuPost),
  entry("cards", birthdayCard),
  entry("print", cafeMenu),
  entry("social", quotePost),
  entry("presentation", quarterlyReview),
  entry("cards", thankYouPostcard),
  entry("social", podcastThumbnail),
  entry("print", yardSalePoster),
  entry("social", recipePin),
  entry("cards", businessCardBold),
  entry("print", openStudioPoster),
  entry("social", workshopPost),
  entry("presentation", lessonSlides),
  entry("cards", babyShowerInvite),
  entry("social", bookClubCover),
  entry("print", certificate),
];
