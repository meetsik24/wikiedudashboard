import React from 'react';
import createReactClass from 'create-react-class';
import PropTypes from 'prop-types';
import jQuery from 'jquery';
import moment from 'moment';
import OnClickOutside from 'react-onclickoutside';
import SalesforceMediaButtons from '../articles/salesforce_media_buttons.jsx';
import Loading from '../common/loading.jsx';

const DiffViewer = createReactClass({
  displayName: 'DiffViewer',

  // Diff viewer takes a main (final) revision, and optionally a first revision.
  // If a first revision is supplied, it fetches a diff from the parent of the
  // first revision all the way to the main revision.
  // If there is no parent of the first revision — typically because it's the start
  // of a new article — then it uses the first revision as the starting point.
  propTypes: {
    revision: PropTypes.object,
    index: PropTypes.number,
    first_revision: PropTypes.object,
    showButtonLabel: PropTypes.string,
    editors: PropTypes.array,
    showSalesforceButton: PropTypes.bool,
    article: PropTypes.object,
    course: PropTypes.object,
    showButtonClass: PropTypes.string,
    fetchArticleDetails: PropTypes.func,
    shouldShowDiff: PropTypes.func,
    showDiff: PropTypes.func,
    hideDiff: PropTypes.func,
    isFirstArticle: PropTypes.func,
    isLastArticle: PropTypes.func,
    showNextArticle: PropTypes.func,
    showPreviousArticle: PropTypes.func,
    articleTitle: PropTypes.string
  },

  getInitialState() {
    return {
      isArticleOpened: false,
    };
  },

  // When 'show' is clicked, this component may or may not already have
  // users data (a list of usernames) in its props. If it does, then 'show' will
  // fetch the MediaWiki user ids, which are used for coloration. Those can't be
  // fetched until the usernames are available, so 'show' will fetch the usernames
  // first in that case. In that case, componentWillReceiveProps fetches the
  // user ids as soon as usernames are avaialable.
  componentWillReceiveProps(nextProps) {
    if (this.shouldShowDiff() && !this.state.isArticleOpened) {
      this.fetchRevisionDetails();
      this.setState({
        isArticleOpened: true
      });
    } else if (!this.shouldShowDiff() && this.state.isArticleOpened) {
      this.setState({
        isArticleOpened: false
      });
    } else if (!this.props.editors && nextProps.editors) {
      this.initiateDiffFetch(nextProps);
    }
  },

  showButtonLabel() {
    if (this.props.showButtonLabel) {
      return this.props.showButtonLabel;
    }
    return I18n.t('revisions.diff_show');
  },

  showDiff() {
    this.props.showDiff(this.props.index);
    this.setState({
      isArticleOpened: true
    });
  },

  fetchRevisionDetails() {
    if (!this.props.editors) {
      this.props.fetchArticleDetails();
    } else if (!this.state.fetched) {
      this.initiateDiffFetch(this.props);
    }
  },

  shouldShowDiff() {
    return this.props.shouldShowDiff(this.props.index);
  },

  hideDiff() {
    this.props.hideDiff();
    this.setState({
      isArticleOpened: false
    });
  },

  handleClickOutside() {
    // this.props.hideDiff();
  },

  // If a first and current revision are provided, find the parent of the first revision
  // and get a diff from that parent to the current revision.
  // If only a current revision is provided, get diff to the previous revision.
  initiateDiffFetch(props) {
    if (this.state.diffFetchInitiated) {
      return;
    }
    this.setState({ diffFetchInitiated: true });

    if (props.first_revision) {
      return this.findParentOfFirstRevision(props);
    }
    this.fetchDiff(this.diffUrl(props.revision));
  },

  wikiUrl(revision) {
    if (revision.wiki.language) {
      return `https://${revision.wiki.language}.${revision.wiki.project}.org`;
    }

    return `https://${revision.wiki.project}.org`;
  },

  diffUrl(lastRevision, firstRevision) {
    const wikiUrl = this.wikiUrl(lastRevision);
    const queryBase = `${wikiUrl}/w/api.php?action=query&prop=revisions&rvprop=ids|timestamp|comment`;
    // eg, "https://en.wikipedia.org/w/api.php?action=query&prop=revisions&revids=139993&rvdiffto=prev&format=json",
    let diffUrl;
    if (this.state.parentRevisionId) {
      diffUrl = `${queryBase}&revids=${this.state.parentRevisionId}|${lastRevision.mw_rev_id}&rvdiffto=${lastRevision.mw_rev_id}&format=json`;
    } else if (firstRevision) {
      diffUrl = `${queryBase}&revids=${firstRevision.mw_rev_id}|${lastRevision.mw_rev_id}&rvdiffto=${lastRevision.mw_rev_id}&format=json`;
    } else {
      diffUrl = `${queryBase}&revids=${lastRevision.mw_rev_id}&rvdiffto=prev&format=json`;
    }

    return diffUrl;
  },

  webDiffUrl() {
    const wikiUrl = this.wikiUrl(this.props.revision);
    if (this.state.parentRevisionId) {
      return `${wikiUrl}/w/index.php?oldid=${this.state.parentRevisionId}&diff=${this.props.revision.mw_rev_id}`;
    } else if (this.props.first_revision) {
      return `${wikiUrl}/w/index.php?oldid=${this.props.first_revision.mw_rev_id}&diff=${this.props.revision.mw_rev_id}`;
    }
    return `${wikiUrl}/w/index.php?diff=${this.props.revision.mw_rev_id}`;
  },

  findParentOfFirstRevision(props) {
    const wikiUrl = this.wikiUrl(props.revision);
    const queryBase = `${wikiUrl}/w/api.php?action=query&prop=revisions`;
    const diffUrl = `${queryBase}&revids=${props.first_revision.mw_rev_id}&format=json`;
    jQuery.ajax(
      {
        dataType: 'jsonp',
        url: diffUrl,
        success: (data) => {
          const revisionData = data.query.pages[props.first_revision.mw_page_id].revisions[0];
          const parentRevisionId = revisionData.parentid;
          this.setState({ parentRevisionId });
          this.fetchDiff(this.diffUrl(props.revision, props.first_revision));
        }
      });
  },

  fetchDiff(diffUrl) {
    jQuery.ajax(
      {
        dataType: 'jsonp',
        url: diffUrl,
        success: (data) => {
          let firstRevisionData;
          try {
            firstRevisionData = data.query.pages[this.props.revision.mw_page_id].revisions[0];
          } catch (_err) {
            firstRevisionData = {};
          }
          let lastRevisionData;
          try {
            lastRevisionData = data.query.pages[this.props.revision.mw_page_id].revisions[1];
          } catch (_err) { /* noop */
          }

          // Data may or may not include the diff.
          let diff;
          if (firstRevisionData.diff) {
            diff = firstRevisionData.diff['*'];
          } else {
            diff = '<div class="warning">This revision is not available. It may have been deleted. More details may be available on wiki.</div>';
          }

          this.setState({
            diff: diff,
            comment: firstRevisionData.comment,
            fetched: true,
            firstRevDateTime: firstRevisionData.timestamp,
            lastRevDateTime: lastRevisionData ? lastRevisionData.timestamp : null
          });
        }
      });
  },

  previousArticle() {
    if (this.props.isFirstArticle(this.props.index)) {
      return null;
    }
    return (
      <button
        onClick={() => this.props.showPreviousArticle(this.props.index)}
        className="button dark small"
      >
        {I18n.t('articles.previous')}
      </button>
    );
  },

  nextArticle() {
    if (this.props.isLastArticle(this.props.index)) {
      return null;
    }
    return (
      <button onClick={() => this.props.showNextArticle(this.props.index)} className="pull-right button dark small">{I18n.t('articles.next')}</button>
    );
  },

  articleDetails() {
    return (
      <div className="diff-viewer-header">
        <p>{I18n.t('articles.article_title')}: {this.props.articleTitle}</p>
      </div>
    );
  },

  authorsHTML() {
    return (
      <div className="user-legend-wrap">
        <div className="user-legend">Edits by:</div>
        <div className="user-legend">{this.props.editors.join()}</div>
      </div>
    );
  },

  render() {
    if (!this.state.isArticleOpened || !this.props.revision) {
      return (
        <div className={`tooltip-trigger ${this.props.showButtonClass}`}>
          <button onClick={this.showDiff} className="icon icon-diff-viewer"/>
          <div className="tooltip tooltip-center dark large">
            <p>{this.showButtonLabel()}</p>
          </div>
        </div>
      );
    }

    let style = 'hidden';
    if (this.shouldShowDiff()) {
      style = '';
    }
    const className = `diff-viewer ${style}`;

    let diff;
    if (!this.state.fetched) {
      diff = <Loading/>;
    } else if (this.state.diff === '') {
      diff = <div> —</div>;
    } else {
      diff = <tbody dangerouslySetInnerHTML={{ __html: this.state.diff }}/>;
    }

    const wikiDiffUrl = this.webDiffUrl();

    let diffComment;
    let revisionDateTime;
    let firstRevTime;
    let lastRevTime;
    let timeSpan;
    let editDate;

    // Edit summary for a single revision:
    //  > Edit date and number of characters added
    // Edit summary for range of revisions:
    //  > First and last times for edits to article (from first applicable rev to last)
    if (!this.props.first_revision) {
      revisionDateTime = moment(this.props.revision.date).format('YYYY/MM/DD h:mm a');

      diffComment = <p className="diff-comment">{this.state.comment}</p>;

      editDate = (
        <p className="diff-comment">
          ({I18n.t('revisions.edited_on', { edit_date: revisionDateTime })};&nbsp;
          {this.props.revision.characters}&nbsp;
          {I18n.t('revisions.chars_added')})
        </p>);
    } else {
      firstRevTime = moment(this.state.firstRevDateTime).format('YYYY/MM/DD h:mm a');
      lastRevTime = moment(this.state.lastRevDateTime).format('YYYY/MM/DD h:mm a');

      timeSpan = I18n.t('revisions.edit_time_span',
        { first_time: firstRevTime, last_time: lastRevTime });

      editDate = <p className="diff-comment">({timeSpan})</p>;
    }

    let salesforceButtons;
    if (this.props.showSalesforceButton) {
      salesforceButtons = (
        <SalesforceMediaButtons
          course={this.props.course}
          article={this.props.article}
          editors={this.props.editors}
          before_rev_id={this.state.parentRevisionId}
          after_rev_id={this.props.revision.mw_rev_id}
        />
      );
    }

    return (
      <div>
        <div className={className}>
          <div className="diff-viewer-header">
            <a className="button dark small" href={wikiDiffUrl} target="_blank">{I18n.t('revisions.view_on_wiki')}</a>
            <button onClick={this.hideDiff} className="pull-right icon-close"/>
            <a
              className="pull-right button small diff-viewer-feedback"
              href="/feedback?subject=Diff Viewer"
              target="_blank"
            >
              How did the diff viewer work for you?
            </a>
          </div>
          <div className="diff-viewer-header">
            {this.previousArticle()}
            {this.nextArticle()}
          </div>
          {this.articleDetails()}
          <div>
            <div className="diff-viewer-scrollbox">
              {salesforceButtons}
              <table>
                <thead>
                  <tr>
                    <th colSpan="4" className="diff-header">{diffComment}</th>
                  </tr>
                  <tr>
                    <th colSpan="4" className="diff-header">{editDate}</th>
                  </tr>
                </thead>
                {diff}
              </table>
            </div>
          </div>
          <div className="diff-viewer-footer">
            {this.authorsHTML()}
          </div>
        </div>
      </div>
    );
  }
});

export default OnClickOutside(DiffViewer);
