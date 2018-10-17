import React from 'react';
import { StyleSheet, View, Text } from 'react-native';

import Link from '../Link';
import Rating from '../partials/Rating';
import { elementSideMargins, descriptionTextColor } from '../../styles/CardStyle';

const styles = StyleSheet.create({
  container: {
    marginTop: 5,
    ...elementSideMargins,
  },
});

export default class MobieData extends React.Component {
  displayRating(rating) {
    if (!rating) {
      return null;
    }
    return <Rating image={rating.img} />;
  }

  displayDirector(director) {
    if (!director || !director.info) {
      return null;
    }
    return (
      <Link label="director-link" url={director.info.url}>
        <View>
          <Text style={{ color: descriptionTextColor }}>
            {director.title}: {director.info.name}
          </Text>
        </View>
      </Link>
    );
  }

  render() {
    const data = this.props.data;
    const richData = data.rich_data || {};
    const rating = richData.rating;
    const director = richData.director;
    return (
      <View style={styles.container}>
        <View
          accessible={false}
          accessibilityLabel={'movie-rating'}
        >
          {this.displayRating(rating)}
        </View>
        <View
          accessible={false}
          accessibilityLabel={'movie-director'}
        >
          { this.displayDirector(director) }
        </View>
      </View>
    );
  }
}
