/**
 * The loaded workspace as grey blocks: the same wrappers and classes as the real layout (tabs, two panes, a chat card and a contracts card), so when
 * the content arrives it fills the same boxes and nothing jumps. Hidden from assistive technology; the "waking up" status line says what is going on.
 */
const Bar = ({ w, h = 14 }: { w: string; h?: number }) => <i className="sk" style={{ width: w, height: h }} />;

export function WorkspaceSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="tabs"><span className="sk-tab"><Bar w="40%" /></span><span className="sk-tab"><Bar w="50%" /></span></div>
      <div className="workspace" data-tab="chat">
        <div className="pane chatpane">
          <section className="chat">
            <div className="panehead"><Bar w="90px" h={20} /></div>
            <div className="sk-stack"><Bar w="70%" h={44} /><Bar w="45%" h={44} /><Bar w="60%" h={64} /></div>
          </section>
        </div>
        <div className="pane contractspane">
          <section className="contracts">
            <div className="panehead"><Bar w="120px" h={20} /></div>
            <article className="card">
              <div className="sk-stack"><Bar w="35%" /><Bar w="100%" h={10} /><Bar w="80%" /><Bar w="65%" /><Bar w="50%" /></div>
            </article>
          </section>
        </div>
      </div>
    </div>
  );
}
