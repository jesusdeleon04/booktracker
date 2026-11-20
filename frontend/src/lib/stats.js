import { daysBetween, parseDate } from './format'

// Reading statistics computed from the library (instant, no network).

export function finishedYear(b) {
  return b.finishedAt ? Number(b.finishedAt.slice(0, 4)) : null
}

export function availableYears(books) {
  const years = new Set([new Date().getFullYear()])
  books.forEach((b) => {
    if (b.status === 'read' && b.finishedAt) years.add(finishedYear(b))
  })
  return [...years].sort((a, b) => b - a)
}

export function computeStats(books, year) {
  const read = books.filter((b) => b.status === 'read')
  const inScope = year === 'all' ? read : read.filter((b) => finishedYear(b) === year)
  const reading = books.filter((b) => b.status === 'reading')
  const want = books.filter((b) => b.status === 'want')

  const pages = inScope.reduce((s, b) => s + (b.pageCount || 0), 0)
  const withPages = inScope.filter((b) => b.pageCount).length
  const rated = inScope.filter((b) => b.rating != null)
  const avgRating = rated.length ? rated.reduce((s, b) => s + b.rating, 0) / rated.length : null

  // Monthly shelves (only for a concrete year)
  const months = Array.from({ length: 12 }, () => [])
  if (year !== 'all') {
    inScope.forEach((b) => {
      const d = parseDate(b.finishedAt)
      if (d) months[d.getMonth()].push(b)
    })
  }

  // Yearly evolution (all time)
  const byYear = {}
  read.forEach((b) => {
    const y = finishedYear(b)
    if (y) {
      byYear[y] = byYear[y] || { year: y, count: 0, pages: 0 }
      byYear[y].count += 1
      byYear[y].pages += b.pageCount || 0
    }
  })
  const years = Object.values(byYear).sort((a, b) => a.year - b.year)

  // Genres
  const genreCount = {}
  inScope.forEach((b) => {
    ;(b.genres || []).slice(0, 2).forEach((g, i) => {
      genreCount[g] = (genreCount[g] || 0) + (i === 0 ? 1 : 0.5)
    })
  })
  const genreTotal = Object.values(genreCount).reduce((s, v) => s + v, 0) || 1
  const genres = Object.entries(genreCount)
    .map(([key, v]) => ({ key, value: v, share: v / genreTotal }))
    .sort((a, b) => b.value - a.value)

  // Authors
  const authorMap = {}
  inScope.forEach((b) => {
    ;(b.authors || []).slice(0, 1).forEach((a) => {
      authorMap[a] = authorMap[a] || { name: a, count: 0, ratings: [], covers: [] }
      authorMap[a].count += 1
      if (b.rating != null) authorMap[a].ratings.push(b.rating)
      authorMap[a].covers.push(b)
    })
  })
  const authors = Object.values(authorMap)
    .map((a) => ({ ...a, avg: a.ratings.length ? a.ratings.reduce((s, r) => s + r, 0) / a.ratings.length : null }))
    .sort((a, b) => b.count - a.count || (b.avg || 0) - (a.avg || 0))

  // Ratings distribution (1..5 stars, halves rounded up)
  const dist = [0, 0, 0, 0, 0]
  rated.forEach((b) => {
    dist[Math.min(4, Math.max(0, Math.ceil(b.rating) - 1))] += 1
  })

  // Records
  const byPages = inScope.filter((b) => b.pageCount).sort((a, b) => b.pageCount - a.pageCount)
  const byYearPub = inScope.filter((b) => b.year).sort((a, b) => a.year - b.year)
  const speeds = inScope
    .map((b) => ({ b, days: daysBetween(b.startedAt, b.finishedAt) }))
    .filter((x) => x.days != null && x.days >= 0)
    .sort((a, b) => a.days - b.days)
  const topRated = [...rated].sort((a, b) => b.rating - a.rating || (b.finishedAt || '').localeCompare(a.finishedAt || ''))

  return {
    readCount: inScope.length,
    allReadCount: read.length,
    readingCount: reading.length,
    wantCount: want.length,
    pages,
    withPages,
    avgRating,
    ratedCount: rated.length,
    months,
    years,
    genres,
    authors,
    dist,
    records: {
      longest: byPages[0],
      shortest: byPages.length > 1 ? byPages[byPages.length - 1] : null,
      oldest: byYearPub[0],
      fastest: speeds[0],
      favorite: topRated[0],
    },
    inScope,
  }
}

export function readThisYear(books) {
  const y = new Date().getFullYear()
  return books.filter((b) => b.status === 'read' && finishedYear(b) === y).length
}
