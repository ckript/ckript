import List from "../lists/List";
import ListRow from "../lists/ListRow";
import Sheet from "../overlays/Sheet";
import "./NavMoreSheet.css";

/*
 * NavMoreSheet — the rest of the audience's destinations (prefix: ckm-more).
 *
 * WHY IT EXISTS
 * -------------
 * The bar holds four destinations. The desktop shell puts everything else in a
 * drawer, and the mobile app has no drawer — so until this existed, whatever
 * did not fit in four slots was not merely demoted on a phone, it was
 * unreachable. For the industry audience that was most of the app: their own
 * dashboard, the writer directory, Top Scripts, Search, My Mandates and Saved
 * Projects, none of which any mobile screen linked to either.
 *
 * WHY A SHEET AND NOT A SCREEN
 * ----------------------------
 * Sheet's own docs draw the line: a sheet is for something brief that belongs
 * to the screen behind it, and anything with its own URL is a route. A menu is
 * the brief case — it is a list of links you leave immediately — and giving it
 * a URL would put a menu in the back-button history between every two pages a
 * user visits.
 *
 * WHY THE ROWS ARE LINKS
 * ----------------------
 * Same rule as the bar: a destination is an <a>, so it can be opened in a new
 * tab, long-pressed, previewed and coloured as visited. Only the control that
 * OPENS this sheet is a button, because disclosure is not navigation.
 *
 * The sheet does not close itself on tap. React Router replaces the screen
 * underneath, which unmounts this along with it; a manual close would race that
 * and flash the old screen through the gap.
 */

/**
 * @param {Object} props
 * @param {boolean} props.open
 * @param {Function} props.onClose
 * @param {Array} props.items          `overflow` from useMobileNav
 * @param {string|null} props.activeKey  `activeOverflowKey` from useMobileNav
 * @param {Object} [props.returnFocusTo] ref to focus on close — the More button
 */
export default function NavMoreSheet({
  open = false,
  onClose = null,
  items = [],
  activeKey = null,
  returnFocusTo = null,
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="More"
      description="Everything else in your workspace"
      returnFocusTo={returnFocusTo}
      className="ckm-more"
    >
      <List label="More destinations" className="ckm-more__list">
        {items.map((item) => (
          <ListRow
            key={item.key}
            to={item.path}
            // Create must open a new draft rather than resuming the last one.
            state={item.fresh ? { startFresh: true } : undefined}
            title={item.label}
            leading={item.glyph}
            chevron
            // `current` is the row equivalent of the bar's aria-current, and at
            // most one row can carry it: activeKey is a single key or null.
            current={item.key === activeKey}
            trailing={item.badge > 0 ? (
              <span className="ckm-more__badge">
                {item.badge > 99 ? "99+" : item.badge}
                <span className="ckm-sr-only">{` unread`}</span>
              </span>
            ) : null}
          />
        ))}
      </List>
    </Sheet>
  );
}
