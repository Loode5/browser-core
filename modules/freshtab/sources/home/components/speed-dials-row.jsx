import PropTypes from 'prop-types';
import React from 'react';
import cliqz from '../cliqz';
import SpeedDial from './speed-dial';
import Placeholder from './placeholder';
import AddSpeedDial from './add-speed-dial';
import { speedDialClickSignal, speedDialDeleteSignal } from '../services/telemetry/speed-dial';
import config from '../../config';

export default class SpeedDialsRow extends React.Component {
  static get propTypes() {
    return {
      type: PropTypes.string,
      dials: PropTypes.array,
      removeSpeedDial: PropTypes.func,
      addSpeedDial: PropTypes.func,
      getSpeedDials: PropTypes.func,
      showPlaceholder: PropTypes.bool,
    };
  }

  constructor(props) {
    super(props);
    this.resetAll = this.resetAll.bind(this);
  }

  componentWillMount() {
    this.setState({
      isCustom: this.props.type === 'custom',
      showAddButton: () => {
        if (!this.state.isCustom) {
          return null;
        }
        return this.state.displayAddBtn();
      },
      displayAddBtn: () => this.props.dials.length < config.constants.MAX_SPOTS,
    });
  }

  get getDials() {
    return this.props.dials.slice(0, config.constants.MAX_SPOTS);
  }

  removeSpeedDial(dial, index) {
    speedDialDeleteSignal(this.state.isCustom, index);
    this.props.removeSpeedDial(dial, index);
  }

  visitSpeedDial(index) {
    speedDialClickSignal(this.state.isCustom, index);
  }

  resetAll() {
    cliqz.freshtab.resetAllHistory().then(() => {
      this.closeUndo('history');
      this.props.getSpeedDials();
    });

    cliqz.core.sendTelemetry({
      type: 'home',
      action: 'click',
      target_type: 'reset-all-history'
    });
  }

  render() {
    const placeholdersLength = config.constants.MAX_SPOTS - this.getDials.length;
    const placeholders = [...Array(placeholdersLength)];

    return (
      <div>
        <div className="dials-row">
          {
            this.getDials.map((dial, i) =>
              (<SpeedDial
                key={dial.url}
                dial={dial}
                removeSpeedDial={() => this.removeSpeedDial(dial, i)}
                visitSpeedDial={() => this.visitSpeedDial(i)}
                updateSpeedDial={newDial => this.props.updateSpeedDial(newDial, i)}
              />)
            )
          }
          {this.props.showPlaceholder &&
            placeholders.map((el, ind) => {
              const placeholderKey = `placeholder-${ind}`;
              return (<Placeholder
                key={placeholderKey}
              />);
            })
          }
          {this.state.showAddButton() &&
            <AddSpeedDial addSpeedDial={this.props.addSpeedDial} />
          }
        </div>
      </div>
    );
  }
}
