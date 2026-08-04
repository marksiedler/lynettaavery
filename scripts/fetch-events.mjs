// Fetches upcoming live events from Eventbrite for this account and
// writes them to events-data.json for the static site to read.
// Requires EVENTBRITE_TOKEN as an environment variable (set as a
// GitHub Actions secret — never committed to the repo).

const token = process.env.EVENTBRITE_TOKEN;
if (!token) {
  console.error('Missing EVENTBRITE_TOKEN environment variable');
  process.exit(1);
}

const headers = { Authorization: `Bearer ${token}` };

async function getOrganizationId() {
  const res = await fetch('https://www.eventbriteapi.com/v3/users/me/organizations/', { headers });
  if (!res.ok) {
    throw new Error(`Failed to fetch organizations: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const orgs = data.organizations || [];
  if (!orgs.length) throw new Error('No organizations found for this token');
  return orgs[0].id;
}

async function getEvents(orgId) {
  const url = new URL(`https://www.eventbriteapi.com/v3/organizations/${orgId}/events/`);
  url.searchParams.set('status', 'live');
  url.searchParams.set('order_by', 'start_asc');
  url.searchParams.set('expand', 'venue');
  url.searchParams.set('time_filter', 'current_future');

  let events = [];
  let page = 1;
  while (true) {
    url.searchParams.set('page', String(page));
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`Failed to fetch events: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    events = events.concat(data.events || []);
    if (!data.pagination || !data.pagination.has_more_items) break;
    page += 1;
  }
  return events;
}

function formatEvent(e) {
  const venue = e.venue;
  const location = venue
    ? [venue.name, venue.address && venue.address.city, venue.address && venue.address.region]
        .filter(Boolean).join(', ')
    : (e.online_event ? 'Online' : '');
  return {
    id: e.id,
    name: (e.name && e.name.text) || '',
    description: e.summary || '',
    url: e.url,
    start: (e.start && e.start.local) || null,
    end: (e.end && e.end.local) || null,
    timezone: (e.start && e.start.timezone) || null,
    location,
    image: (e.logo && e.logo.url) || null,
    isFree: e.is_free || false,
  };
}

async function main() {
  const orgId = await getOrganizationId();
  const events = await getEvents(orgId);
  const formatted = events.map(formatEvent);

  const output = {
    updated_at: new Date().toISOString(),
    events: formatted,
  };

  const fs = await import('node:fs/promises');
  await fs.writeFile('events-data.json', JSON.stringify(output, null, 2));
  console.log(`Wrote ${formatted.length} events to events-data.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
