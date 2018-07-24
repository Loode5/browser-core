import React from 'react';
import { StyleSheet, View, Text } from 'react-native';

import { getMessage } from '../../../core/i18n';
import Link from '../Link';
import Icon from './Icon';
import { elementTopMargin } from '../../styles/CardStyle';

export default class PoweredByKicker extends React.Component {


  render() {
    const data = this.props.data;
    // powered by
    return <Link url="http://www.kicker.de/?gomobile=1">
      <View style={styles.container}>
        <Icon url='kicker.de' width={20} height={20} />
        <Text style={styles.text}>{getMessage('KickerSponsor')}</Text>
      </View>
    </Link>
  }
}

const styles = StyleSheet.create({
  container: {
    ...elementTopMargin,
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    marginLeft: 10,
    color: '#999',
  },
});
