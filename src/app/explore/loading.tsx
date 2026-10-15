export default function ExploreLoading() {
  return (
    <main className="explore-page page-shell" aria-busy="true" aria-label="Loading the personality collection">
      <div className="explore-loading-heading" />
      <div className="explore-loading-controls" />
      <div className="explore-loading-rows">{Array.from({ length: 5 }, (_, index) => <span key={index} />)}</div>
    </main>
  );
}
