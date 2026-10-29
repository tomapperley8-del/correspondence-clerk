// Plain words for the Club Card page problems worked out by v_club_card_members (Stage 6b).

export type ClubCardIssue =
  | 'page_lapsed' | 'page_no_member' | 'no_page' | 'offer_old' | 'offer_ending'
  | 'not_in_az' | 'az_twice' | 'not_on_map' | 'no_category' | 'contact_differs'

export const ISSUE_LABEL: Record<ClubCardIssue, string> = {
  page_lapsed: 'Card ended, page still live',
  page_no_member: 'Page but no Club Card on file',
  no_page: 'No page on the website',
  offer_old: 'Offer looks out of date',
  offer_ending: 'Offer ending',
  not_in_az: 'Not in the A-Z',
  az_twice: 'Listed twice in the A-Z',
  not_on_map: 'Not on the map',
  no_category: 'In no category page',
  contact_differs: 'Contact details differ',
}

export const CARD_STATE_LABEL: Record<string, string> = {
  member: 'Card in force',
  grace: 'Card ended, in the 60-day grace',
  lapsed: 'Card ended',
  none: 'No Club Card on file',
}
