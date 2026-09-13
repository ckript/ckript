import { asInt, asTrimmedString } from "./requestValue.js";

export const HALL_OF_FAME_PAGE_SIZE = 12;
export const HALL_OF_FAME_MAX_PAGE_SIZE = 24;
export const HALL_OF_FAME_FEATURED_PAGE_SIZE = 6;
export const HALL_OF_FAME_FEATURED_MAX_PAGE_SIZE = 12;

const scalar = (value) => (["string", "number"].includes(typeof value) ? value : undefined);

export const parseHallOfFamePaging = (query = {}) => {
  const rawYear = asInt(scalar(query?.year), { min: 1900, max: 2200, fallback: 0 });
  return {
    page: asInt(scalar(query?.page), { min: 1, max: 1000, fallback: 1 }),
    limit: asInt(scalar(query?.limit), {
      min: 1,
      max: HALL_OF_FAME_MAX_PAGE_SIZE,
      fallback: HALL_OF_FAME_PAGE_SIZE,
    }),
    year: rawYear || null,
    competition: asTrimmedString(query?.competition, 120) || "",
  };
};

export const parseHallOfFameFeaturedPaging = (query = {}) => ({
  page: asInt(scalar(query?.scriptPage), { min: 1, max: 1000, fallback: 1 }),
  limit: asInt(scalar(query?.scriptLimit), {
    min: 1,
    max: HALL_OF_FAME_FEATURED_MAX_PAGE_SIZE,
    fallback: HALL_OF_FAME_FEATURED_PAGE_SIZE,
  }),
});

export const hallOfFamePageInfo = ({ page, limit, total }) => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
  hasMore: page * limit < total,
});

export const HALL_OF_FAME_LIST_FIELDS = [
  "name",
  "slug",
  "theme.title",
  "bannerUrl",
  "prizePool",
  "dates",
  "resultsDeclaredAt",
].join(" ");

export const HALL_OF_FAME_DETAIL_FIELDS = [
  "name",
  "slug",
  "theme",
  "bannerUrl",
  "prizePool",
  "overview",
  "dates",
  "resultsDeclaredAt",
  "prizes",
  "judges",
  "sponsors",
 "badgeImages"].join(" ");
